import {
	jsonProperty,
	jsonArrayProperty,
	jsonSetProperty,
	jsonMapProperty,
	jsonLiteralProperty,
	jsonEnumProperty,
} from '../src/metadata.ts'
import { assertEquals } from '@std/assert'
import { Type } from 'typebox'
import { generateSchema } from '../src/json-schema/generate-schema.ts'
import { date } from '../src/json-schema/schema-util.ts'

class Person {
	@jsonLiteralProperty('Person')
	__type: 'Person' = 'Person'
	@jsonProperty(String)
	name: string = ''
	@jsonEnumProperty(['Male', 'Female'])
	gender: 'Male' | 'Female' = 'Male'
	@jsonProperty(Date)
	dob: Date = new Date()
	@jsonProperty(Number)
	age: number = 0
	@jsonProperty(Boolean)
	isMarried: boolean = false
	@jsonProperty(() => CityAddress)
	address: CityAddress = new CityAddress()
	@jsonArrayProperty(Person)
	children: Person[] = []
	@jsonSetProperty(Person)
	friends: Set<Person> = new Set()
	@jsonMapProperty(String, Person)
	contacts: Map<string, Person> = new Map()

	privateProperty: string = ''
}

class Address {
	@jsonProperty(String)
	street: string = ''
	@jsonProperty(() => Country)
	country: Country = new Country()
}

class CityAddress extends Address {
	@jsonProperty(String)
	city: string = ''
}

class Country {
	@jsonProperty(String)
	name: string = ''
}

class OtherRelevantClass {
	@jsonProperty(String)
	name: string = ''
}

class IrrelevantClass {
	@jsonProperty(String)
	name: string = ''
}

Deno.test('generateSchema for Address non-recursively', () => {
	const schema = generateSchema([Address], undefined, false)
	assertEquals(
		schema.$defs.Address,
		Type.Object({
			street: Type.String(),
		}),
	)
})

Deno.test('generateSchema for Address recursively', () => {
	const schema = generateSchema([Address], undefined, true)
	assertEquals(
		schema.$defs.Address,
		Type.Object({
			street: Type.String(),
			country: Type.Ref('#/defs/Country'),
		}),
	)
})

Deno.test('generateSchema for Person', () => {
	const schema = generateSchema([Person], undefined, true)
	console.log(JSON.stringify(schema, null, 2))
	assertEquals(schema.$defs, {
		Person: Type.Object({
			__type: Type.Literal('Person'),
			name: Type.String(),
			gender: Type.Enum(['Male', 'Female']),
			dob: date,
			age: Type.Number(),
			isMarried: Type.Boolean(),
			address: Type.Ref('#/defs/CityAddress'),
			children: Type.Array(Type.Ref('#/defs/Person')),
			friends: Type.Array(Type.Ref('#/defs/Person')),
			contacts: Type.Mapped(
				Type.Identifier('K'),
				Type.String(),
				Type.Ref('K'),
				Type.Ref('#/defs/Person'),
			),
		}),
		Address: Type.Object({
			street: Type.String(),
			country: Type.Ref('#/defs/Country'),
		}),
		CityAddress: Type.Intersect([
			Type.Object({
				city: Type.String(),
			}),
			Type.Ref('#/defs/Address'),
		]),
		Country: Type.Object({
			name: Type.String(),
		}),
	})
})
