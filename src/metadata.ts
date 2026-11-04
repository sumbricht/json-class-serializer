import { JsonClassSerializer } from './mod.ts'
import type {
	CtorOrThunk,
	JsonClassData,
	JsonPropertyOptions,
	JsonProperty,
	MaybeThunk,
	JsonClassOptions,
	JsonEnumPropertyOptions,
	JsonSchemaOverride,
	Ctor,
} from './types.ts'
import { AnyType, resolveThunk } from './types.ts'
import {
	arrayBufferToBase64,
	base64ToArrayBuffer,
	base64ToDataView,
	base64ToUint8Array,
	dataViewToBase64,
	uint8ArrayToBase64,
} from './utils.ts'

export const classDataByCtor = new WeakMap<any, JsonClassData>([
	[String, { options: { deserializer: (value: string) => value } }],
	[Number, { options: { deserializer: (value: number) => value } }],
	[Boolean, { options: { deserializer: (value: boolean) => value } }],
	[
		Date,
		{
			options: {
				serializer: (value: Date) =>
					value ? { '#date': value.toISOString() } : value,
				deserializer: (value: { '#date': string } | string) => {
					if (!value) return value
					if (typeof value === 'string') return new Date(value)
					return new Date(value['#date'])
				},
			},
		},
	],
	[
		BigInt,
		{
			options: {
				serializer: (value: bigint) =>
					value !== undefined ? { '#bigInt': value.toString() } : value,
				deserializer: (value: { '#bigInt': string } | bigint) => {
					if (!value) return value
					if (typeof value === 'bigint') return value
					return BigInt(value['#bigInt'])
				},
			},
		},
	],
	[
		ArrayBuffer,
		{
			options: {
				serializer: (arrayBuffer: ArrayBuffer) =>
					arrayBuffer
						? {
								'#arrayBuffer': arrayBufferToBase64(arrayBuffer),
							}
						: arrayBuffer,
				deserializer: (value: { '#arrayBuffer': string } | ArrayBuffer) => {
					if (!value) return value
					if (value instanceof ArrayBuffer) return value
					return base64ToArrayBuffer(value['#arrayBuffer'])
				},
			},
		},
	],
	[
		Uint8Array,
		{
			options: {
				serializer: (uint8Array: Uint8Array) =>
					uint8Array
						? {
								'#uint8Array': uint8ArrayToBase64(uint8Array),
							}
						: uint8Array,
				deserializer: (value: { '#uint8Array': string } | Uint8Array) => {
					if (!value) return value
					if (value instanceof Uint8Array) return value
					return base64ToUint8Array(value['#uint8Array'])
				},
			},
		},
	],
	[
		DataView,
		{
			options: {
				serializer: (dataView: DataView) =>
					dataView
						? {
								'#dataView': dataViewToBase64(dataView),
							}
						: dataView,
				deserializer: (value: { '#dataView': string } | DataView) => {
					if (!value) return value
					if (value instanceof DataView) return value
					return base64ToDataView(value['#dataView'])
				},
			},
		},
	],
	[
		Symbol,
		{
			options: {
				serializer: (value: symbol) => {
					if (!value) return value
					const description = value.description!
					const newSymbol = Symbol.for(description)
					if (newSymbol !== value) {
						throw new Error(
							`Cannot serialize Symbol ${description} as it is not a unique symbol`,
						)
					}
					return { '#symbol': description }
				},
				deserializer: (value: { '#symbol': string } | symbol) => {
					if (!value) return value
					if (typeof value === 'symbol') return value
					const description = value['#symbol']
					return Symbol.for(description)
				},
			},
		},
	],
])
export const deserializionClassByMagicPropertyName = new Map<string, any>([
	['#date', Date],
	['#arrayBuffer', ArrayBuffer],
	['#uint8Array', Uint8Array],
	['#dataView', DataView],
	['#symbol', Symbol],
])
const { Buffer, Temporal } = globalThis as any
if (Buffer) {
	classDataByCtor.set(Buffer, {
		options: {
			serializer: (buffer: typeof Buffer) => ({
				'#buffer': buffer.toString('base64'),
			}),
			deserializer: (value: { '#buffer': string } | typeof Buffer) => {
				if (value instanceof Buffer) return value
				return Buffer.from(value['#buffer'], 'base64')
			},
		},
	})
	deserializionClassByMagicPropertyName.set('#buffer', Buffer)
}
if (Temporal) {
	// Temporal types are only available in environments that support Temporal
	classDataByCtor.set(Temporal.Instant, {
		options: {
			serializer: (value: any) => ({
				'#instant': value.toString(),
			}),
			deserializer: (value: { '#instant': string } | any) => {
				if (value instanceof Temporal.Instant) return value
				return Temporal.Instant.from(
					(value as { '#instant': string })['#instant'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainDate, {
		options: {
			serializer: (value: any) => ({
				'#plainDate': value.toString(),
			}),
			deserializer: (value: { '#plainDate': string } | any) => {
				if (value instanceof Temporal.PlainDate) return value
				return Temporal.PlainDate.from(
					(value as { '#plainDate': string })['#plainDate'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainTime, {
		options: {
			serializer: (value: any) => ({
				'#plainTime': value.toString(),
			}),
			deserializer: (value: { '#plainTime': string } | any) => {
				if (value instanceof Temporal.PlainTime) return value
				return Temporal.PlainTime.from(
					(value as { '#plainTime': string })['#plainTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainDateTime, {
		options: {
			serializer: (value: any) => ({
				'#plainDateTime': value.toString(),
			}),
			deserializer: (value: { '#plainDateTime': string } | any) => {
				if (value instanceof Temporal.PlainDateTime) return value
				return Temporal.PlainDateTime.from(
					(value as { '#plainDateTime': string })['#plainDateTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainYearMonth, {
		options: {
			serializer: (value: any) => ({
				'#plainYearMonth': value.toString(),
			}),
			deserializer: (value: { '#plainYearMonth': string } | any) => {
				if (value instanceof Temporal.PlainYearMonth) return value
				return Temporal.PlainYearMonth.from(
					(value as { '#plainYearMonth': string })['#plainYearMonth'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainMonthDay, {
		options: {
			serializer: (value: any) => ({
				'#plainMonthDay': value.toString(),
			}),
			deserializer: (value: { '#plainMonthDay': string } | any) => {
				if (value instanceof Temporal.PlainMonthDay) return value
				return Temporal.PlainMonthDay.from(
					(value as { '#plainMonthDay': string })['#plainMonthDay'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.ZonedDateTime, {
		options: {
			serializer: (value: any) => ({
				'#zonedDateTime': value.toString(),
			}),
			deserializer: (value: { '#zonedDateTime': string } | any) => {
				if (value instanceof Temporal.ZonedDateTime) return value
				return Temporal.ZonedDateTime.from(
					(value as { '#zonedDateTime': string })['#zonedDateTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.Duration, {
		options: {
			serializer: (value: any) => ({
				'#duration': value.toString(),
			}),
			deserializer: (value: { '#duration': string } | any) => {
				if (value instanceof Temporal.Duration) return value
				return Temporal.Duration.from(
					(value as { '#duration': string })['#duration'],
				)
			},
		},
	})
	deserializionClassByMagicPropertyName.set('#instant', Temporal.Instant)
	deserializionClassByMagicPropertyName.set('#plainDate', Temporal.PlainDate)
	deserializionClassByMagicPropertyName.set('#plainTime', Temporal.PlainTime)
	deserializionClassByMagicPropertyName.set(
		'#plainDateTime',
		Temporal.PlainDateTime,
	)
	deserializionClassByMagicPropertyName.set(
		'#plainYearMonth',
		Temporal.PlainYearMonth,
	)
	deserializionClassByMagicPropertyName.set(
		'#plainMonthDay',
		Temporal.PlainMonthDay,
	)
	deserializionClassByMagicPropertyName.set(
		'#zonedDateTime',
		Temporal.ZonedDateTime,
	)
	deserializionClassByMagicPropertyName.set('#duration', Temporal.Duration)
}

/**
 * Symbol that allows access to the global class registry (on `globalThis`) and class-specific metadata (on the class function).
 */
export const ClassDataSymbol = Symbol.for('JsonClassData')
export const classDataByName =
	(globalThis as any)[ClassDataSymbol] ?? new Map<string, JsonClassData>() // ensure only one instance of the map exists even if JsonClassSerializer is imported multiple times in separate chunks
;(globalThis as any)[ClassDataSymbol] = classDataByName

/**
 * Decorator to globally register a class for serialization/deserialization.
 * @param name The name of the class. If not provided, the class name will be used (explicitly provide a name if you use mangling during code minimization).
 * @param options Options for the class.
 */
export function jsonClass(
	name?: MaybeThunk<string | null>,
	options: JsonClassOptions = {},
): ClassDecorator {
	return (ctor: any) => {
		const data = ensureJsonClassData(ctor)
		data.name =
			name !== null
				? resolveThunk(name) ||
					JsonClassSerializer.defaultOptions.classNameResolver(ctor)
				: undefined
		data.ctor = ctor
		data.options = options
		ctor.prototype[ClassDataSymbol] = data
		if (data.name) {
			classDataByName.set(data.name, data)
		}

		ctor.prototype.toJSON = function () {
			const jsc = JsonClassSerializer.defaultInstance
			return jsc.serializeToObject(this)
		}
		ctor.prototype.toJSON[ClassDataSymbol] = true
	}
}

/**
 * Decorator to register a property for serialization/deserialization. Properties not decorated with this decorator will be ignored when serializing/deserializing.
 * @param ctorOrThunk The constructor of the property type, or an arrow function that returns the constructor of the property type. Must be provided unless the property type is string/number/boolean.
 * @param options Options for the property.
 */
export function jsonProperty(
	ctorOrThunk?: CtorOrThunk,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return function (target: any, propertyKey: string | symbol) {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'class',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

export function jsonLiteralProperty(
	value: string | number | boolean,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'enum',
			values: [value],
			options,
		})
	}
}

export function jsonEnumProperty(
	values: (string | number | boolean)[],
	options: JsonEnumPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'enum',
			values,
			options,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as an array.
 * @param ctorOrThunk The constructor of the array item type, or an arrow function that returns the constructor of the array item type. Must always be set; if item typ is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonArrayProperty(
	ctorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'array',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as a map.
 * @param keyCtorOrThunk The constructor of the map key type, or an arrow function that returns the constructor of the map key type. Must always be set; if key type is string/number/boolean, provide String/Number/Boolean.
 * @param valueCtorOrThunk The constructor of the map value type, or an arrow function that returns the constructor of the map value type. Must always be set; if value type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonMapProperty(
	keyCtorOrThunk: CtorOrThunk | typeof AnyType,
	valueCtorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'map',
			options,
			keyCtorOrThunk,
			valueCtorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as a set.
 * @param ctorOrThunk The constructor of the set item type, or an arrow function that returns the constructor of the set item type. Must always be set; if item type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonSetProperty(
	ctorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'set',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as any type (same as `@jsonProperty(AnyType)`).
 * @param options Options for the property.
 */
export function jsonAnyProperty(
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'any',
			options,
		})
	}
}

function ensureJsonClassData(ctor: any): JsonClassData {
	let data = classDataByCtor.get(ctor)
	if (!data) {
		data = {}
		classDataByCtor.set(ctor, data)
	}
	return data
}

function setPropertyInternal(
	ctor: object,
	propertyKey: PropertyKey,
	propertyData: JsonProperty,
) {
	const data = ensureJsonClassData(ctor)
	if (!data.properties) data.properties = new Map()
	data.properties.set(propertyKey, propertyData)
}

/**
 * Gets all properties of a class, including inherited ones. Super class properties come first; a property redeclared in a subclass keeps its position but uses the subclass's metadata.
 * Intermediate classes in the prototype chain without any metadata are skipped.
 */
export function getAllProperties(ctor: any): Map<PropertyKey, JsonProperty> {
	const chain: any[] = []
	for (
		let c = ctor;
		c && c !== Function.prototype;
		c = Object.getPrototypeOf(c)
	) {
		chain.unshift(c)
	}
	const properties = new Map<PropertyKey, JsonProperty>()
	for (const c of chain) {
		for (const [key, property] of classDataByCtor.get(c)?.properties ?? []) {
			properties.set(key, property)
		}
	}
	return properties
}

/**
 * Read-only description of a property registered with one of the `@json...Property` decorators.
 */
export interface PropertyMetadata {
	readonly key: PropertyKey
	readonly kind: 'class' | 'array' | 'set' | 'map' | 'enum' | 'any'
	/** The class whose decorator registered the property. */
	readonly declaringClass: Ctor
	/** Declared class of the value (`class`), of the items (`array`, `set`) or of the map values (`map`). `AnyType` if any value is allowed. */
	readonly declaredClass?: Ctor
	/** Declared class of the map keys (`map` only). */
	readonly keyClass?: Ctor
	/** Allowed values (`enum` only; one value for `@jsonLiteralProperty`). */
	readonly values?: readonly (string | number | boolean)[]
	readonly valueDescriptions?: Readonly<Record<string, string>>
	readonly required: boolean
	readonly nullable: boolean
	/** Whether the property has its own serializer or deserializer. */
	readonly customSerialized: boolean
	/** Explicit default from the property options, as it appears in serialized JSON. */
	readonly default?: unknown
	readonly title?: string
	readonly description?: string
	readonly examples?: readonly unknown[]
	readonly schema?: JsonSchemaOverride
}

/**
 * Read-only description of a class known to JsonClassSerializer.
 */
export interface ClassMetadata {
	readonly ctor: Ctor
	/** Registered name, i.e. the value of the discriminator. Undefined for classes that cannot be resolved by name. */
	readonly name?: string
	/** Nearest class in the prototype chain that has metadata. */
	readonly parent?: Ctor
	readonly abstract: boolean
	/** Whether the class has a class-level serializer or deserializer, which defines its JSON instead of its properties. */
	readonly customSerialized: boolean
	readonly title?: string
	readonly description?: string
	readonly examples?: readonly unknown[]
	readonly schema?: JsonSchemaOverride
	/** Properties declared by this class itself. */
	readonly ownProperties: readonly PropertyMetadata[]
	/** All properties including inherited ones, in serialization order. */
	readonly properties: readonly PropertyMetadata[]
}

/**
 * Gets the metadata of a class, or undefined if no class in its prototype chain has any.
 * @param ctor The class (constructor).
 */
export function getClassMetadata(ctor: Ctor): ClassMetadata | undefined {
	return buildClassMetadata(ctor, classDataByCtor.get(ctor)?.name)
}

/**
 * Lists all classes that a JsonClassSerializer can resolve by name: the global class registry (if `useGlobalClassRegistry` is set) and `additionalClassesToConsider`.
 * A class registered under several names is listed once per name.
 * @param serializer The serializer whose options to use. Default: `JsonClassSerializer.defaultInstance`
 */
export function listRegisteredClasses(
	serializer: JsonClassSerializer = JsonClassSerializer.defaultInstance,
): ClassMetadata[] {
	const entries = new Map<string, Ctor>()
	if (serializer.options.useGlobalClassRegistry) {
		for (const [name, data] of classDataByName as Map<string, JsonClassData>) {
			if (data.ctor) entries.set(name, data.ctor)
		}
	}
	for (const [name, ctor] of Object.entries(
		resolveThunk(serializer.options.additionalClassesToConsider),
	)) {
		if (!entries.has(name)) entries.set(name, ctor)
	}
	const result: ClassMetadata[] = []
	for (const [name, ctor] of entries) {
		const metadata = buildClassMetadata(ctor, name)
		if (metadata) result.push(metadata)
	}
	return result
}

function buildClassMetadata(
	ctor: Ctor,
	name: string | undefined,
): ClassMetadata | undefined {
	const data = classDataByCtor.get(ctor)
	let parent: Ctor | undefined
	for (
		let c = Object.getPrototypeOf(ctor);
		c && c !== Function.prototype;
		c = Object.getPrototypeOf(c)
	) {
		if (classDataByCtor.has(c)) {
			parent = c
			break
		}
	}
	if (!data && !parent) return undefined

	const declaringClassByProperty = new Map<JsonProperty, Ctor>()
	for (
		let c: any = ctor;
		c && c !== Function.prototype;
		c = Object.getPrototypeOf(c)
	) {
		for (const property of classDataByCtor.get(c)?.properties?.values() ?? []) {
			declaringClassByProperty.set(property, c)
		}
	}
	const toMetadata = ([key, property]: [PropertyKey, JsonProperty]) =>
		buildPropertyMetadata(
			key,
			property,
			declaringClassByProperty.get(property)!,
		)
	const options: JsonClassOptions = data?.options ?? {}
	return Object.freeze({
		ctor,
		name,
		parent,
		abstract: !!options.abstract,
		customSerialized: !!(options.serializer || options.deserializer),
		title: options.title,
		description: options.description,
		examples: options.examples,
		schema: options.schema,
		ownProperties: Object.freeze([...(data?.properties ?? [])].map(toMetadata)),
		properties: Object.freeze([...getAllProperties(ctor)].map(toMetadata)),
	})
}

function buildPropertyMetadata(
	key: PropertyKey,
	property: JsonProperty,
	declaringClass: Ctor,
): PropertyMetadata {
	const { options } = property
	return Object.freeze({
		key,
		kind: property.type,
		declaringClass,
		declaredClass:
			property.type == 'any'
				? AnyType
				: 'valueCtorOrThunk' in property
					? (resolveThunk(property.valueCtorOrThunk) as Ctor | undefined)
					: undefined,
		keyClass:
			property.type == 'map'
				? (resolveThunk(property.keyCtorOrThunk) as Ctor | undefined)
				: undefined,
		values:
			property.type == 'enum' ? Object.freeze([...property.values]) : undefined,
		valueDescriptions:
			property.type == 'enum' ? property.options.valueDescriptions : undefined,
		required: !!options.required,
		nullable: options.nullable !== false,
		customSerialized: !!(options.serializer || options.deserializer),
		default: options.default,
		title: options.title,
		description: options.description,
		examples: options.examples,
		schema: options.schema,
	})
}
