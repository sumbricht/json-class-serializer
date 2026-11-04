import { JsonClassSerializer } from '../json-class-serializer.ts'
import {
	classDataByCtor,
	getAllProperties,
	listRegisteredClasses,
} from '../metadata.ts'
import type {
	Ctor,
	JsonClassData,
	JsonProperty,
	JsonSchema,
	JsonSchemaAnnotations,
	JsonSchemaObject,
	JsonSchemaOverride,
} from '../types.ts'
import { AnyType, resolveThunk } from '../types.ts'

/**
 * Options for {@link generateSchema}.
 */
export interface GenerateSchemaOptions {
	/**
	 * The serializer whose options define the JSON (discriminator name, map serialization strategy, circular dependency markers, resolvable class names). Default: `JsonClassSerializer.defaultInstance`
	 */
	serializer?: JsonClassSerializer
	/**
	 * Whether to throw instead of collecting a warning when part of the JSON cannot be described (e.g. a class with a custom serializer but no `schema` option). Default: false
	 */
	strict?: boolean
	/**
	 * Whether to accept circular dependency references (`{ "<circularDependencyReferencePropertyName>": [...] }`) wherever a class instance can appear. Default: false
	 */
	allowCircularReferences?: boolean
	/** Title of the root schema. */
	title?: string
	/** Description of the root schema. */
	description?: string
}

/**
 * Result of {@link generateSchema}.
 */
export interface GenerateSchemaResult {
	/** A plain JSON Schema (draft 2020-12). */
	schema: JsonSchemaObject
	/** Parts of the JSON that could not be described exactly; their schema accepts any value. */
	warnings: string[]
}

const SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'
const POLYMORPHIC_SUFFIX = '.polymorphic'

const magicObject = (key: string, value: JsonSchemaObject): JsonSchema => ({
	type: 'object',
	properties: { [key]: value },
	required: [key],
	additionalProperties: false,
})
const base64 = { type: 'string', contentEncoding: 'base64' }
const builtInSchemas = new Map<unknown, JsonSchema>([
	[String, { type: 'string' }],
	[Number, { type: 'number' }],
	[Boolean, { type: 'boolean' }],
	[
		Date,
		{
			anyOf: [
				magicObject('#date', { type: 'string', format: 'date-time' }),
				{ type: 'string', format: 'date-time' },
			],
		},
	],
	[BigInt, magicObject('#bigInt', { type: 'string', pattern: '^-?[0-9]+$' })],
	[ArrayBuffer, magicObject('#arrayBuffer', base64)],
	[Uint8Array, magicObject('#uint8Array', base64)],
	[DataView, magicObject('#dataView', base64)],
	[Symbol, magicObject('#symbol', { type: 'string' })],
])
const { Buffer, Temporal } = globalThis as any
if (Buffer) builtInSchemas.set(Buffer, magicObject('#buffer', base64))
if (Temporal) {
	for (const [ctor, key, format] of [
		[Temporal.Instant, '#instant', 'date-time'],
		[Temporal.PlainDate, '#plainDate', 'date'],
		[Temporal.PlainTime, '#plainTime', undefined],
		[Temporal.PlainDateTime, '#plainDateTime', undefined],
		[Temporal.PlainYearMonth, '#plainYearMonth', undefined],
		[Temporal.PlainMonthDay, '#plainMonthDay', undefined],
		[Temporal.ZonedDateTime, '#zonedDateTime', undefined],
		[Temporal.Duration, '#duration', 'duration'],
	]) {
		builtInSchemas.set(
			ctor,
			magicObject(
				key,
				format ? { type: 'string', format } : { type: 'string' },
			),
		)
	}
}
// classes whose deserialized value is a primitive, so duplicates in a Set are lost
const primitiveValueClasses = new Set<unknown>([
	String,
	Number,
	Boolean,
	BigInt,
	Symbol,
])

/**
 * Generates a JSON Schema (draft 2020-12) of the JSON that `deserializeFromObject` turns into instances of the given root classes without error and without silently dropping data.
 *
 * - Every class gets one entry in `$defs`, keyed by its registered name, with its own and inherited properties.
 * - A position whose declared class has subclasses (a polymorphic position) refers to `$defs["<name>.polymorphic"]`, which selects the class from the discriminator.
 * - Properties are optional and nullable unless declared with `required: true` / `nullable: false`. Unknown properties are rejected.
 *
 * @param roots The classes a serialized document can have at its root. Their subclasses are included.
 * @param options See {@link GenerateSchemaOptions}.
 */
export function generateSchema(
	roots: Ctor[],
	options: GenerateSchemaOptions = {},
): GenerateSchemaResult {
	return new SchemaGenerator(options).generate(roots)
}

class SchemaGenerator {
	private readonly serializer: JsonClassSerializer
	private readonly discriminator: string
	private readonly warnings: string[] = []
	private readonly defs: Record<string, JsonSchema> = {}
	/** Registered names by class; the first one is the name the serializer writes. */
	private readonly namesByCtor = new Map<Ctor, string[]>()
	private readonly defKeyByCtor = new Map<Ctor, string>()
	private readonly usedDefKeys = new Set<string>()
	private readonly warnedCustomSubclasses = new Set<Ctor>()

	constructor(private readonly options: GenerateSchemaOptions) {
		this.serializer = options.serializer ?? JsonClassSerializer.defaultInstance
		this.discriminator = this.serializer.options.serializationPropertyName

		for (const metadata of listRegisteredClasses(this.serializer)) {
			const names = this.namesByCtor.get(metadata.ctor) ?? []
			// the name the serializer writes goes first
			if (metadata.name == classDataByCtor.get(metadata.ctor)?.name)
				names.unshift(metadata.name!)
			else names.push(metadata.name!)
			this.namesByCtor.set(metadata.ctor, names)
		}
		for (const [ctor, names] of this.namesByCtor) {
			this.defKeyByCtor.set(ctor, names[0])
			this.usedDefKeys.add(names[0])
		}
	}

	generate(roots: Ctor[]): GenerateSchemaResult {
		const branches = [
			...new Set(roots.flatMap((r) => this.dispatchBranches(r))),
		]
		let root: JsonSchemaObject
		if (branches.length) {
			for (const r of roots) {
				if (!this.namesByCtor.has(r) && !this.isAbstract(r))
					this.warn(
						`Root class ${r.name} has no registered name, so it cannot be selected by the discriminator '${this.discriminator}'`,
					)
			}
			root = this.dispatch(branches, undefined)
		} else if (roots.length == 1) {
			root = this.positionSchema(roots[0]) as JsonSchemaObject
		} else {
			throw new Error(
				'None of the root classes has a registered name, so the discriminator cannot select one of them',
			)
		}

		const schema: JsonSchemaObject = {
			$schema: SCHEMA_DIALECT,
			...(this.options.title ? { title: this.options.title } : {}),
			...(this.options.description
				? { description: this.options.description }
				: {}),
			...root,
			$defs: this.defs,
		}
		return { schema, warnings: this.warnings }
	}

	// classes

	/** Schema of a value at a position declared with `ctor` (without nullability). */
	private positionSchema(ctor: any): JsonSchema {
		if (ctor === AnyType) return {}
		const builtIn = builtInSchemas.get(ctor)
		if (builtIn) return JSON.parse(JSON.stringify(builtIn))

		let schema: JsonSchema
		const data = classDataByCtor.get(ctor)
		// a custom deserializer receives the raw value, so the discriminator plays no role
		const branches = this.isCustomSerialized(data)
			? []
			: this.dispatchBranches(ctor)
		const hasSubclassBranches = branches.some((b) => b !== ctor)
		if (
			!this.isCustomSerialized(data) &&
			(this.isAbstract(ctor) || hasSubclassBranches)
		) {
			schema = { $ref: this.ref(this.polymorphicDef(ctor, branches)) }
		} else {
			schema = { $ref: this.ref(this.classDef(ctor)) }
		}

		const refProperty =
			this.serializer.options.circularDependencyReferencePropertyName
		if (this.options.allowCircularReferences && refProperty) {
			schema = {
				anyOf: [
					schema,
					{
						type: 'object',
						properties: { [refProperty]: { type: 'array' } },
						required: [refProperty],
						additionalProperties: false,
					},
				],
			}
		}
		return schema
	}

	/** Classes the discriminator can select at a position declared with `declared`. */
	private dispatchBranches(declared: Ctor): Ctor[] {
		const branches: Ctor[] = []
		for (const ctor of this.namesByCtor.keys()) {
			if (!this.isSubclassOrSelf(ctor, declared)) continue
			if (this.isAbstract(ctor)) continue
			if (this.isCustomSerialized(classDataByCtor.get(ctor))) {
				// its JSON has no discriminator; a schema override of the declared class may describe it
				const declaredHasOverride =
					classDataByCtor.get(declared)?.options?.schema !== undefined
				if (
					ctor !== declared &&
					!declaredHasOverride &&
					!this.warnedCustomSubclasses.has(ctor)
				) {
					this.warnedCustomSubclasses.add(ctor)
					this.warn(
						`Class ${this.displayName(ctor)} has a custom serializer, so its JSON is not accepted at positions declared as ${this.displayName(declared)}`,
					)
				}
				continue
			}
			branches.push(ctor)
		}
		return branches
	}

	private polymorphicDef(declared: Ctor, branches: Ctor[]): string {
		const key = this.defKey(declared) + POLYMORPHIC_SUFFIX
		if (key in this.defs) return key
		if (this.usedDefKeys.has(key))
			throw new Error(
				`Registered name '${key}' collides with the generated schema entry for the subclasses of ${this.displayName(declared)}`,
			)
		this.usedDefKeys.add(key)
		this.defs[key] = true // placeholder for recursion
		const abstract = this.isAbstract(declared)
		if (!branches.length) {
			this.warn(
				`Abstract class ${this.displayName(declared)} has no subclass that the discriminator can select`,
			)
			this.defs[key] = false
			return key
		}
		this.defs[key] = this.dispatch(branches, abstract ? undefined : declared)
		return key
	}

	/** Selects one of `branches` by the discriminator; without a discriminator the value is a `fallback` (or invalid, if undefined). */
	private dispatch(
		branches: Ctor[],
		fallback: Ctor | undefined,
	): JsonSchemaObject {
		const d = this.discriminator
		const names = branches.flatMap((b) => this.namesByCtor.get(b) ?? [])
		const allOf: JsonSchema[] = branches.map((b) => {
			const branchNames = this.namesByCtor.get(b)!
			return {
				if: {
					properties: {
						[d]:
							branchNames.length == 1
								? { const: branchNames[0] }
								: { enum: branchNames },
					},
					required: [d],
				},
				then: { $ref: this.ref(this.classDef(b)) },
			}
		})
		if (fallback) {
			allOf.push({
				if: { not: { required: [d] } },
				then: { $ref: this.ref(this.classDef(fallback)) },
			})
		}
		return {
			type: 'object',
			description: fallback
				? `A ${this.displayName(fallback)} or one of its subclasses. '${d}' selects the class; without it, the value is a ${this.displayName(fallback)}.`
				: `One of ${names.join(', ')}. '${d}' selects the class.`,
			properties: { [d]: { enum: names } },
			...(fallback ? {} : { required: [d] }),
			allOf,
		}
	}

	private classDef(ctor: Ctor): string {
		const key = this.defKey(ctor)
		if (key in this.defs) return key
		this.defs[key] = true // placeholder for recursion
		const data = classDataByCtor.get(ctor)
		const options = data?.options ?? {}
		let schema: JsonSchema
		if (this.isCustomSerialized(data)) {
			schema = annotate({}, options)
			if (!options.schema) {
				this.warn(
					`Class ${this.displayName(ctor)} has a custom serializer but no 'schema' option, so any value is accepted`,
				)
			}
		} else if (!data && !getAllProperties(ctor).size) {
			this.warn(
				`Class ${this.displayName(ctor)} has no serialization metadata, so any object is accepted`,
			)
			schema = { type: 'object' }
		} else {
			schema = annotate(this.objectSchema(ctor), options)
		}
		this.defs[key] = applyOverride(schema, options.schema)
		return key
	}

	private objectSchema(ctor: Ctor): JsonSchemaObject {
		const properties: Record<string, JsonSchema> = {}
		const required: string[] = []
		const names = this.namesByCtor.get(ctor)
		if (names) {
			properties[this.discriminator] =
				names.length == 1 ? { const: names[0] } : { enum: names }
		}
		const levelProperty =
			this.serializer.options.circularDependencyLevelPropertyName
		if (levelProperty) {
			properties[levelProperty] = { type: 'integer', minimum: 0 }
		}

		const defaults = this.sampleDefaults(ctor)
		for (const [key, property] of getAllProperties(ctor)) {
			if (typeof key == 'symbol') continue // not representable in JSON
			const name = String(key)
			properties[name] = this.propertySchema(
				ctor,
				name,
				property,
				defaults?.get(name),
			)
			if (property.options.required) required.push(name)
		}

		return {
			type: 'object',
			properties,
			...(required.length ? { required } : {}),
			additionalProperties: false,
		}
	}

	// properties

	private propertySchema(
		owner: Ctor,
		key: string,
		property: JsonProperty,
		sampledDefault: { value: unknown } | undefined,
	): JsonSchema {
		const { options } = property
		const nullable = options.nullable !== false
		const orNull = (s: JsonSchema) => (nullable ? withNull(s) : s)
		let schema: JsonSchema

		if (options.serializer || options.deserializer) {
			if (!options.schema)
				this.warn(
					`Property ${this.displayName(this.declaringClass(owner, property))}.${key} has a custom serializer but no 'schema' option, so any value is accepted`,
				)
			schema = {}
		} else if (property.type == 'any') {
			schema = {}
		} else if (property.type == 'enum') {
			schema = enumSchema(property.values, property.options.valueDescriptions)
		} else {
			const valueCtor = resolveThunk(property.valueCtorOrThunk)
			if (property.type == 'class') {
				// without a class, only primitives can be serialized
				schema = valueCtor
					? this.positionSchema(valueCtor)
					: { type: ['string', 'number', 'boolean'] }
			} else {
				if (!valueCtor)
					throw new Error(
						`Property ${this.displayName(owner)}.${key} has no item class. Please provide a constructor or an arrow function that returns the constructor, even for primitive types`,
					)
				const items = orNull(this.positionSchema(valueCtor))
				if (property.type == 'array') {
					schema = { type: 'array', items }
				} else if (property.type == 'set') {
					schema = {
						type: 'array',
						items,
						...(primitiveValueClasses.has(valueCtor)
							? { uniqueItems: true }
							: {}),
					}
				} else if (property.type == 'map') {
					const keyCtor = resolveThunk(property.keyCtorOrThunk)
					if (!keyCtor)
						throw new Error(
							`Property ${this.displayName(owner)}.${key} has no key class. Please provide a constructor or an arrow function that returns the constructor, even for primitive types`,
						)
					schema = this.mapSchema(orNull(this.positionSchema(keyCtor)), items)
				} else {
					throw new Error(
						`Unknown property type of ${this.displayName(owner)}.${key}`,
					)
				}
			}
		}

		schema = annotate(orNull(schema), options)
		const defaultValue =
			'default' in options ? { value: options.default } : sampledDefault
		if (defaultValue && typeof schema == 'object') {
			schema = { ...schema, default: defaultValue.value }
		}
		return applyOverride(schema, options.schema)
	}

	private mapSchema(
		keySchema: JsonSchema,
		valueSchema: JsonSchema,
	): JsonSchema {
		const entry = {
			type: 'array',
			prefixItems: [keySchema, valueSchema],
			minItems: 2,
			items: false,
		}
		const keyValue = {
			type: 'object',
			properties: { key: keySchema, value: valueSchema },
			required: ['key', 'value'],
			additionalProperties: false,
		}
		return {
			type: 'array',
			description: 'Map entries',
			items: {
				anyOf:
					this.serializer.options.mapSerializationStrategy ==
					'arrayOfKeyValueObjects'
						? [keyValue, entry]
						: [entry, keyValue],
			},
		}
	}

	/**
	 * Serialized initializer values of a class's properties. Only values that are the same for two instances created at different times are returned, so generated ids or timestamps are not presented as defaults.
	 */
	private sampleDefaults(
		ctor: Ctor,
	): Map<string, { value: unknown }> | undefined {
		if (this.isAbstract(ctor)) return undefined
		const sample = () => {
			const instance = new (ctor as new () => any)()
			return this.serializer.serializeToObject(instance) as Record<
				string,
				unknown
			>
		}
		let first: Record<string, unknown>
		let second: Record<string, unknown>
		try {
			first = sample()
			const start = Date.now()
			while (Date.now() === start) {
				// wait for the clock to advance so time-based initializers differ
			}
			second = sample()
		} catch {
			return undefined // e.g. constructor needs arguments
		}
		if (!first || typeof first != 'object') return undefined

		const defaults = new Map<string, { value: unknown }>()
		for (const [key, value] of Object.entries(first)) {
			if (value === undefined) continue
			if (JSON.stringify(value) !== JSON.stringify(second?.[key])) continue
			defaults.set(key, { value: JSON.parse(JSON.stringify(value)) })
		}
		return defaults
	}

	// helpers

	private isAbstract(ctor: Ctor): boolean {
		return !!classDataByCtor.get(ctor)?.options?.abstract
	}

	private isCustomSerialized(data: JsonClassData | undefined): boolean {
		return !!(data?.options?.serializer || data?.options?.deserializer)
	}

	private isSubclassOrSelf(ctor: Ctor, ancestor: Ctor): boolean {
		for (
			let c: any = ctor;
			c && c !== Function.prototype;
			c = Object.getPrototypeOf(c)
		) {
			if (c === ancestor) return true
		}
		return false
	}

	private defKey(ctor: Ctor): string {
		let key = this.defKeyByCtor.get(ctor)
		if (key) return key
		key = ctor.name || 'Anonymous'
		for (let i = 2; this.usedDefKeys.has(key); i++) key = `${ctor.name}_${i}`
		this.defKeyByCtor.set(ctor, key)
		this.usedDefKeys.add(key)
		return key
	}

	/** The class in the prototype chain of `ctor` whose decorator registered `property`. */
	private declaringClass(ctor: Ctor, property: JsonProperty): Ctor {
		for (
			let c: any = ctor;
			c && c !== Function.prototype;
			c = Object.getPrototypeOf(c)
		) {
			for (const p of classDataByCtor.get(c)?.properties?.values() ?? []) {
				if (p === property) return c
			}
		}
		return ctor
	}

	private displayName(ctor: Ctor): string {
		return this.namesByCtor.get(ctor)?.[0] ?? ctor.name
	}

	private ref(defKey: string): string {
		const pointer = defKey.replace(/~/g, '~0').replace(/\//g, '~1')
		return `#/$defs/${encodeURIComponent(pointer)}`
	}

	private warn(message: string) {
		if (this.options.strict) throw new Error(message)
		if (!this.warnings.includes(message)) this.warnings.push(message)
	}
}

function enumSchema(
	values: (string | number | boolean)[],
	valueDescriptions: Record<string, string> | undefined,
): JsonSchema {
	if (values.length == 1) return { const: values[0] }
	if (!valueDescriptions) return { enum: [...values] }
	return {
		anyOf: values.map((value) => {
			const description = valueDescriptions[String(value)]
			return description ? { const: value, description } : { const: value }
		}),
	}
}

// keywords that also constrain `null`, so it cannot simply be added to `type`
const typeIndependentKeywords = new Set([
	'const',
	'enum',
	'anyOf',
	'allOf',
	'oneOf',
	'not',
	'if',
	'$ref',
	'$dynamicRef',
])

function withNull(schema: JsonSchema): JsonSchema {
	if (typeof schema == 'boolean') return schema || { type: 'null' }
	const keys = Object.keys(schema)
	if (!keys.length) return schema // accepts anything already
	if (schema.type && !keys.some((k) => typeIndependentKeywords.has(k))) {
		// the other keywords only constrain values of the listed types
		return { ...schema, type: [...[schema.type].flat(), 'null'] }
	}
	if (keys.length == 1 && keys[0] == 'const') {
		return { enum: [schema.const, null] }
	}
	if (keys.length == 1 && keys[0] == 'enum') {
		return { enum: [...schema.enum, null] }
	}
	if (keys.length == 1 && keys[0] == 'anyOf') {
		return { anyOf: [...schema.anyOf, { type: 'null' }] }
	}
	return { anyOf: [schema, { type: 'null' }] }
}

function annotate(
	schema: JsonSchema,
	annotations: JsonSchemaAnnotations,
): JsonSchema {
	const { title, description, examples } = annotations
	if (title === undefined && description === undefined && !examples)
		return schema
	return {
		...(typeof schema == 'object' ? schema : schema ? {} : { not: {} }),
		...(title !== undefined ? { title } : {}),
		...(description !== undefined ? { description } : {}),
		...(examples ? { examples } : {}),
	}
}

function applyOverride(
	schema: JsonSchema,
	override: JsonSchemaOverride | undefined,
): JsonSchema {
	if (override === undefined) return schema
	if (typeof override == 'function')
		return override(typeof schema == 'object' ? schema : {})
	return override
}
