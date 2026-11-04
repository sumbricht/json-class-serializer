import {
	assert,
	assertEquals,
	assertFalse,
	assertStrictEquals,
	assertThrows,
} from '@std/assert'
import { Ajv2020 } from 'ajv/dist/2020.js'
import addFormatsModule from 'ajv-formats'
import { JsonClassSerializer } from '../src/json-class-serializer.ts'
import {
	getClassMetadata,
	jsonAnyProperty,
	jsonArrayProperty,
	jsonClass,
	jsonEnumProperty,
	jsonMapProperty,
	jsonProperty,
	jsonSetProperty,
	listRegisteredClasses,
} from '../src/metadata.ts'
import {
	generateSchema,
	type GenerateSchemaOptions,
} from '../src/json-schema/generate-schema.ts'
import type { Ctor } from '../src/types.ts'

const addFormats: (ajv: any) => void =
	(addFormatsModule as any).default ?? addFormatsModule

// fixtures

@jsonClass('Shape', { abstract: true, description: 'A geometric shape' })
abstract class Shape {
	@jsonProperty(String, { required: true, description: 'Unique id' })
	id: string = ''
	@jsonEnumProperty(['red', 'green'], {
		valueDescriptions: { red: 'Warm colour', green: 'Calm colour' },
	})
	color: 'red' | 'green' = 'red'
}

@jsonClass('Circle')
class Circle extends Shape {
	@jsonProperty(Number)
	radius: number = 1
}

// intermediate class without any metadata
abstract class Polygon extends Shape {}

@jsonClass('Square')
class Square extends Polygon {
	@jsonProperty(Number)
	side: number = 1
}

@jsonClass('Pet')
class Pet {
	@jsonProperty(String)
	name: string = ''
}

@jsonClass('Dog')
class Dog extends Pet {
	@jsonProperty(Boolean)
	goodBoy: boolean = true
}

@jsonClass('Money', {
	serializer: (money: Money) => `${money.amount} ${money.currency}`,
	deserializer: (value: string) => {
		if (typeof value != 'string') return value
		const [amount, currency] = value.split(' ')
		return new Money(Number(amount), currency)
	},
	schema: { type: 'string', pattern: '^[0-9.]+ [A-Z]{3}$' },
})
class Money {
	constructor(
		public amount = 0,
		public currency = 'CHF',
	) {}
}

// not registered by name
class Point {
	@jsonProperty(Number)
	x: number = 0
	@jsonProperty(Number)
	y: number = 0
}

@jsonClass('Group')
class Group {
	@jsonProperty(String)
	label: string = ''
	@jsonArrayProperty(() => Group)
	groups: Group[] = []
	@jsonArrayProperty(() => Shape)
	shapes: Shape[] = []
}

@jsonClass('Drawing', { title: 'Drawing', description: 'A drawing document' })
class Drawing {
	@jsonProperty(String, { description: 'Display name' })
	name: string = 'Untitled'
	@jsonEnumProperty(['draft', 'final'], { nullable: false })
	status: 'draft' | 'final' = 'draft'
	@jsonArrayProperty(() => Shape)
	shapes: Shape[] = []
	@jsonProperty(() => Shape)
	focus: Shape | null = null
	@jsonProperty(Pet)
	pet: Pet = new Pet()
	@jsonMapProperty(String, () => Shape)
	shapesById: Map<string, Shape> = new Map()
	@jsonMapProperty(Number, String)
	labels: Map<number, string> = new Map()
	@jsonSetProperty(String)
	tags: Set<string> = new Set()
	@jsonSetProperty(Pet)
	pets: Set<Pet> = new Set()
	@jsonProperty(Money)
	budget: Money = new Money()
	@jsonProperty(Date)
	createdOn: Date = new Date()
	@jsonProperty(BigInt)
	revision: bigint = BigInt(0)
	@jsonProperty(() => Point)
	origin: Point = new Point()
	@jsonProperty(() => Group)
	root: Group = new Group()
	@jsonAnyProperty()
	extra: any = {}
	@jsonProperty()
	untyped: string | number = 1
}

// helpers

const serializer = new JsonClassSerializer({
	serializationPropertyName: '__type',
})

function compile(
	roots: Ctor[] = [Drawing],
	options: GenerateSchemaOptions = { serializer },
) {
	const { schema, warnings } = generateSchema(roots, options)
	const ajv = new Ajv2020({
		allErrors: true,
		strict: true,
		allowUnionTypes: true,
	})
	addFormats(ajv)
	return { validate: ajv.compile(schema), schema, warnings }
}

const { validate, schema, warnings } = compile()

function assertValid(doc: unknown, v = validate) {
	assert(v(doc), JSON.stringify(v.errors, null, 2))
}

function assertInvalidAt(doc: unknown, instancePath: string, keyword?: string) {
	assertFalse(validate(doc), 'document should be invalid')
	const errors = validate.errors ?? []
	assert(
		errors.some(
			(e: any) =>
				e.instancePath == instancePath && (!keyword || e.keyword == keyword),
		),
		`expected a ${keyword ?? ''} error at '${instancePath}', got ${JSON.stringify(errors, null, 2)}`,
	)
}

function circle(id: string, radius = 2) {
	return Object.assign(new Circle(), { id, radius })
}

function square(id: string, side = 3) {
	return Object.assign(new Square(), { id, side, color: 'green' as const })
}

function sampleDrawing(): Drawing {
	const drawing = new Drawing()
	drawing.name = 'Sample'
	drawing.status = 'final'
	drawing.shapes = [circle('c1'), square('s1')]
	drawing.focus = square('s2')
	drawing.pet = Object.assign(new Dog(), { name: 'Rex' })
	drawing.shapesById = new Map<string, Shape>([
		['a', circle('c2')],
		['b', square('s3')],
	])
	drawing.labels = new Map([
		[1, 'one'],
		[2, 'two'],
	])
	drawing.tags = new Set(['x', 'y'])
	drawing.pets = new Set([new Pet(), new Pet(), new Dog()]) // equal JSON, distinct instances
	drawing.budget = new Money(12.5, 'EUR')
	drawing.revision = BigInt(42)
	drawing.origin = Object.assign(new Point(), { x: 1, y: 2 })
	const child = Object.assign(new Group(), {
		label: 'child',
		shapes: [circle('c3')],
	})
	drawing.root = Object.assign(new Group(), { label: 'root', groups: [child] })
	drawing.extra = { a: [1, { b: 2 }] }
	drawing.untyped = 'text'
	return drawing
}

// round trip

Deno.test('schema: serialized instances validate', () => {
	assertEquals(warnings, [])
	assertValid(serializer.serializeToObject(sampleDrawing()))
	assertValid(serializer.serializeToObject(new Drawing()))
})

Deno.test(
	'schema: serialized instances validate with other serializer options',
	() => {
		const other = new JsonClassSerializer({
			serializationPropertyName: '#kind',
			mapSerializationStrategy: 'arrayOfKeyValueObjects',
			circularDependencyLevelPropertyName: '#level',
		})
		const { validate: v, warnings: w } = compile([Drawing], {
			serializer: other,
		})
		assertEquals(w, [])
		const obj = other.serializeToObject(sampleDrawing()) as any
		assertEquals(obj['#level'], 0)
		assert(!Array.isArray(obj.labels[0]))
		assertValid(obj, v)
		assertFalse(v(serializer.serializeToObject(sampleDrawing()))) // '__type' is unknown there
	},
)

Deno.test('schema: valid documents deserialize to equal instances', () => {
	const obj = serializer.serializeToObject(sampleDrawing())
	const roundTripped = serializer.serializeToObject(
		serializer.deserializeFromObject(obj, Drawing),
	)
	assertEquals(roundTripped, obj)
})

Deno.test('schema: accepts what the deserializer accepts without loss', () => {
	assertValid({ __type: 'Drawing' }) // everything optional
	assertValid({
		__type: 'Drawing',
		name: null,
		focus: null,
		createdOn: '2026-01-01T00:00:00.000Z', // Date as string
		labels: [{ key: 1, value: 'one' }], // the other map entry form
		shapes: [{ __type: 'Square', id: 's', side: null }],
		pet: { name: 'Plain pet without discriminator' },
		origin: {},
		budget: '3 CHF',
	})
	assertValid({ __type: 'Drawing', pet: { __type: 'Pet', name: 'x' } })
})

// negative cases

Deno.test('schema: rejects a wrong discriminator', () => {
	assertInvalidAt(
		{ __type: 'Drawing', shapes: [{ __type: 'Nope', id: 'x' }] },
		'/shapes/0/__type',
		'enum',
	)
	assertInvalidAt(
		{ __type: 'Drawing', pet: { __type: 'Circle', id: 'x' } },
		'/pet/__type',
		'enum',
	)
	assertInvalidAt({ __type: 'Group' }, '/__type', 'enum') // not a root class
})

Deno.test(
	'schema: rejects a missing discriminator at an abstract position',
	() => {
		assertInvalidAt(
			{ __type: 'Drawing', shapes: [{ id: 'x' }] },
			'/shapes/0',
			'required',
		)
		assertInvalidAt(
			{ __type: 'Drawing', focus: { id: 'x' } },
			'/focus',
			'required',
		)
		assertInvalidAt({ name: 'no root discriminator' }, '', 'required')
	},
)

Deno.test('schema: rejects wrong enum values and primitive types', () => {
	assertInvalidAt({ __type: 'Drawing', status: 'archived' }, '/status', 'enum')
	assertInvalidAt({ __type: 'Drawing', status: null }, '/status', 'enum')
	assertInvalidAt({ __type: 'Drawing', name: 5 }, '/name', 'type')
	assertInvalidAt(
		{
			__type: 'Drawing',
			shapes: [{ __type: 'Circle', id: 'c', color: 'blue' }],
		},
		'/shapes/0/color',
	)
	assertInvalidAt(
		{ __type: 'Drawing', tags: ['a', 'a'] },
		'/tags',
		'uniqueItems',
	)
	assertInvalidAt(
		{ __type: 'Drawing', budget: { amount: 1 } },
		'/budget',
		'type',
	)
})

Deno.test('schema: rejects unknown and missing required properties', () => {
	assertInvalidAt(
		{
			__type: 'Drawing',
			shapes: [{ __type: 'Circle', id: 'c', colour: 'red' }],
		},
		'/shapes/0',
		'additionalProperties',
	)
	assertInvalidAt(
		{ __type: 'Drawing', pet: { name: 'Rex', goodBoy: true } }, // Dog without discriminator is a Pet
		'/pet',
		'additionalProperties',
	)
	assertInvalidAt(
		{ __type: 'Drawing', origin: { __type: 'Point' } }, // unnamed class has no discriminator
		'/origin',
		'additionalProperties',
	)
	assertInvalidAt(
		{ __type: 'Drawing', shapes: [{ __type: 'Circle' }] },
		'/shapes/0',
		'required',
	)
})

// schema shape

Deno.test('schema: flattens inheritance into one entry per class', () => {
	const square = schema.$defs.Square
	assertEquals(Object.keys(square.properties), [
		'__type',
		'id',
		'color',
		'side',
	])
	assertEquals(square.required, ['id'])
	assertEquals(square.additionalProperties, false)
	assertEquals(square.properties.__type, { const: 'Square' })
	assertFalse('Shape' in schema.$defs) // abstract: never a branch
	assertFalse('Polygon' in schema.$defs)
	assertFalse(JSON.stringify(schema).includes('allOf":[{"$ref'))
})

Deno.test(
	'schema: dispatches polymorphic positions on the discriminator',
	() => {
		const shape = schema.$defs['Shape.polymorphic']
		assertEquals(shape.required, ['__type'])
		assertEquals(shape.properties.__type, { enum: ['Circle', 'Square'] })
		assertEquals(shape.allOf.length, 2)
		assertEquals(shape.allOf[0], {
			if: { properties: { __type: { const: 'Circle' } }, required: ['__type'] },
			then: { $ref: '#/$defs/Circle' },
		})

		const pet = schema.$defs['Pet.polymorphic']
		assertEquals(pet.required, undefined)
		assertEquals(pet.allOf.at(-1), {
			if: { not: { required: ['__type'] } },
			then: { $ref: '#/$defs/Pet' },
		})
		assertEquals(schema.$defs.Drawing.properties.pet.anyOf[0], {
			$ref: '#/$defs/Pet.polymorphic',
		})
		assertEquals(schema.$defs.Drawing.properties.origin.anyOf[0], {
			$ref: '#/$defs/Point',
		})
		assertEquals(schema.required, ['__type'])
		assertEquals(schema.properties.__type, { enum: ['Drawing'] })
	},
)

Deno.test('schema: describes maps, sets and nullability', () => {
	const p = schema.$defs.Drawing.properties
	assertEquals(p.tags, {
		type: ['array', 'null'],
		items: { type: ['string', 'null'] },
		uniqueItems: true,
		default: [],
	})
	assertEquals(p.pets.uniqueItems, undefined)
	assertEquals(p.labels.items.anyOf[0], {
		type: 'array',
		prefixItems: [{ type: ['number', 'null'] }, { type: ['string', 'null'] }],
		minItems: 2,
		items: false,
	})
	assertEquals(p.status, { enum: ['draft', 'final'], default: 'draft' })
	assertEquals(p.untyped.type, ['string', 'number', 'boolean', 'null'])
	assertEquals(p.extra, { default: {} })
})

Deno.test('schema: includes deterministic defaults only', () => {
	const p = schema.$defs.Drawing.properties
	assertEquals(p.name.default, 'Untitled')
	assertEquals(p.budget.default, '0 CHF')
	assertEquals(p.revision.default, { '#bigInt': '0' })
	assertEquals(p.pet.default, { name: '' })
	assertFalse('default' in p.createdOn) // new Date() differs per instance
	assertEquals(schema.$defs.Circle.properties.radius.default, 1)
})

Deno.test(
	'schema: includes titles, descriptions and value descriptions',
	() => {
		const drawing = schema.$defs.Drawing
		assertEquals(drawing.title, 'Drawing')
		assertEquals(drawing.description, 'A drawing document')
		assertEquals(drawing.properties.name.description, 'Display name')
		assertEquals(schema.$defs.Circle.properties.id.description, 'Unique id')
		assertEquals(schema.$defs.Circle.properties.color.anyOf, [
			{ const: 'red', description: 'Warm colour' },
			{ const: 'green', description: 'Calm colour' },
			{ type: 'null' },
		])
	},
)

Deno.test('schema: uses schema overrides for custom serializers', () => {
	assertEquals(schema.$defs.Money, {
		type: 'string',
		pattern: '^[0-9.]+ [A-Z]{3}$',
	})

	@jsonClass('Opaque', { serializer: () => 'opaque', deserializer: () => ({}) })
	class Opaque {}
	@jsonClass('HasOpaque')
	class HasOpaque {
		@jsonProperty(Opaque)
		opaque = new Opaque()
		@jsonProperty(String, { serializer: (s: string) => s.toUpperCase() })
		shout = ''
		@jsonProperty(Number, {
			schema: (generated) => ({ ...generated, minimum: 0 }),
		})
		count = 0
		@jsonProperty(String, { schema: { const: 'fixed' }, default: 'ignored' })
		fixed = 'fixed'
		@jsonProperty(String, { default: 'explicit' })
		explicit = 'sampled'
	}
	@jsonClass('HasMoreOpaque')
	class HasMoreOpaque extends HasOpaque {}
	const result = generateSchema([HasOpaque], { serializer })
	assert(getClassMetadata(HasMoreOpaque)!.name! in result.schema.$defs)
	assertEquals(result.warnings.length, 2) // the inherited property is reported once
	assert(result.warnings[0].includes('Opaque'))
	assert(result.warnings[1].includes('HasOpaque.shout'))
	assertEquals(result.schema.$defs.Opaque, {})
	const p = result.schema.$defs.HasOpaque.properties
	assertEquals(p.count, { type: ['number', 'null'], default: 0, minimum: 0 })
	assertEquals(p.fixed, { const: 'fixed' })
	assertEquals(p.explicit.default, 'explicit')

	assertThrows(
		() => generateSchema([HasOpaque], { serializer, strict: true }),
		Error,
		'custom serializer',
	)
})

Deno.test('schema: accepts every registered name of a class', () => {
	const aliased = new JsonClassSerializer({
		serializationPropertyName: '__type',
		additionalClassesToConsider: { 'circle-alias': Circle },
	})
	const { validate: v, schema: s } = compile([Drawing], { serializer: aliased })
	assertEquals(s.$defs.Circle.properties.__type, {
		enum: ['Circle', 'circle-alias'],
	})
	assertValid(
		{ __type: 'Drawing', shapes: [{ __type: 'circle-alias', id: 'c' }] },
		v,
	)
})

Deno.test('schema: accepts circular references only when asked to', () => {
	const circular = new JsonClassSerializer({
		serializationPropertyName: '__type',
		circularDependencyReferencePropertyName: '#ref',
	})
	const doc = { __type: 'Drawing', focus: { '#ref': ['shapes', 0] } }
	assertFalse(compile([Drawing], { serializer: circular }).validate(doc))
	assertValid(
		doc,
		compile([Drawing], { serializer: circular, allowCircularReferences: true })
			.validate,
	)
})

Deno.test('schema: validates a 1,000-node polymorphic tree quickly', () => {
	let nodes = 0
	function build(depth: number): Group {
		const group = new Group()
		nodes++
		group.shapes = [circle(`c${nodes}`), square(`s${nodes}`)]
		nodes += 2
		if (depth > 0) group.groups = [build(depth - 1), build(depth - 1)]
		return group
	}
	const drawing = new Drawing()
	drawing.root = build(7) // 255 groups, 510 shapes
	drawing.shapes = Array.from({ length: 250 }, (_, i) =>
		i % 2 ? circle(`x${i}`) : square(`x${i}`),
	)
	nodes += 250
	assert(nodes >= 1000)
	const obj = serializer.serializeToObject(drawing)

	const start = performance.now()
	assertValid(obj)
	const elapsed = performance.now() - start
	assert(elapsed < 200, `validation took ${elapsed.toFixed(1)} ms`)
})

// metadata accessor

Deno.test(
	'getClassMetadata: describes a class with inherited properties',
	() => {
		const square = getClassMetadata(Square)!
		assertStrictEquals(square.ctor, Square)
		assertEquals(square.name, 'Square')
		assertStrictEquals(square.parent, Shape) // Polygon has no metadata
		assertFalse(square.abstract)
		assertEquals(
			square.properties.map((p) => p.key),
			['id', 'color', 'side'],
		)
		assertEquals(
			square.ownProperties.map((p) => p.key),
			['side'],
		)
		const id = square.properties[0]
		assertStrictEquals(id.declaringClass, Shape)
		assertStrictEquals(id.declaredClass, String)
		assertEquals([id.kind, id.required, id.nullable], ['class', true, true])
		assertEquals(square.properties[1].valueDescriptions, {
			red: 'Warm colour',
			green: 'Calm colour',
		})
		assert(Object.isFrozen(square))

		const polygon = getClassMetadata(Polygon)!
		assertEquals(polygon.name, undefined)
		assertEquals(polygon.properties.length, 2)
		assert(getClassMetadata(Shape)!.abstract)
		assert(getClassMetadata(Money)!.customSerialized)
		assertEquals(getClassMetadata(class Unknown {}), undefined)
	},
)

Deno.test('listRegisteredClasses: lists classes resolvable by name', () => {
	const aliased = new JsonClassSerializer({
		additionalClassesToConsider: { 'circle-alias': Circle },
	})
	const listed = listRegisteredClasses(aliased)
	const names = listed.map((c) => c.name)
	for (const name of ['Shape', 'Circle', 'Square', 'Drawing', 'circle-alias'])
		assert(names.includes(name), name)
	assertFalse(listed.some((c) => c.ctor === Point))
	assertStrictEquals(listed.find((c) => c.name == 'circle-alias')!.ctor, Circle)

	const local = new JsonClassSerializer({ useGlobalClassRegistry: false })
	assertEquals(listRegisteredClasses(local), [])
})
