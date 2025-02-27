import { assertEquals, assertInstanceOf } from "@std/assert";
import { jsonArrayProperty, jsonClass, jsonMapProperty, jsonProperty, jsonSetProperty } from "../src/metadata.ts";
import { JsonClassSerializer } from "../src/json-class-serializer.ts";
import { assertSimilarInstances } from "./test-util.ts";

@jsonClass('Address')
class Address {
  @jsonProperty(String)
  city: string = ''
  hidden?: string = 'SHOULD NEVER SHOW IN JSON'

  constructor(init: Address) {
    Object.assign(this, init)
  }
}

@jsonClass('Nationality')
class Nationality {
  @jsonProperty()
  country: string = ''

  constructor(init: Nationality) {
    Object.assign(this, init)
  }
}

@jsonClass('Person')
class Person {
  @jsonProperty()
  get __type() { return 'Person' }
  @jsonProperty(() => String)
  name: string = ''
  @jsonProperty(Date)
  dob: Date = new Date()
  @jsonProperty(Number)
  numberOfChildren: number = 0
  @jsonProperty()
  isMarried: boolean = false
  @jsonProperty(Address)
  address!: Address

  @jsonProperty(BigInt)
  accountBalance: bigint = BigInt(0)

  @jsonArrayProperty(() => Nationality)
  nationalities: Nationality[] = []

  @jsonSetProperty(() => String)
  nicknames: Set<string> = new Set()

  @jsonMapProperty(String, Person)
  children: Map<string, Person> = new Map()

  constructor(init: Omit<Person, '__type'>) {
    Object.assign(this, init)
  }

  static createMinimal(name: string, dob: Date) {
    return new Person({ name, dob } as Partial<Person> as any)
  }
}

const createTestPerson = () => new Person({
  name: 'John',
  dob: new Date('2000-01-01'),
  numberOfChildren: 2,
  isMarried: true,
  address: new Address({ city: 'New York' }),
  accountBalance: BigInt(Number.MAX_SAFE_INTEGER + '000'),
  nationalities: [
    new Nationality({ country: 'Switzerland' }),
    new Nationality({ country: 'USA' }),
  ],
  nicknames: new Set(['Johnny', 'John']),
  children: new Map([
    ['Alice', Person.createMinimal('Alice', new Date('2010-01-01'))],
    ['Bob', Person.createMinimal('Bob', new Date('2012-01-01'))],
  ])
})


Deno.test(function serializeObjectWithPrimitives() {
  const jsc = new JsonClassSerializer
  const json = jsc.serialize({ a: 1, b: "2", c: true, d: new Date('2000-01-01') })
  assertEquals(json, '{"a":1,"b":"2","c":true,"d":"2000-01-01T00:00:00.000Z"}')
});

Deno.test(function serializeClassProperties() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serialize(person)
  assertEquals(json, '{"#type":"Person","__type":"Person","name":"John","dob":"2000-01-01T00:00:00.000Z","numberOfChildren":2,"isMarried":true,"address":{"city":"New York"},"accountBalance":"9007199254740991000","nationalities":[{"country":"Switzerland"},{"country":"USA"}],"nicknames":["Johnny","John"],"children":[["Alice",{"__type":"Person","name":"Alice","dob":"2010-01-01T00:00:00.000Z","numberOfChildren":0,"isMarried":false,"accountBalance":"0","nationalities":[],"nicknames":[],"children":[]}],["Bob",{"__type":"Person","name":"Bob","dob":"2012-01-01T00:00:00.000Z","numberOfChildren":0,"isMarried":false,"accountBalance":"0","nationalities":[],"nicknames":[],"children":[]}]]}')
});

Deno.test(function serializeViaJsonStringify() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const jsonFromJsc = jsc.serialize(person)
  const jsonFromJsonStringify = JSON.stringify(person)
  assertEquals(jsonFromJsc, jsonFromJsonStringify)
});

Deno.test(function deserializeClassWithClassHint() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serialize(person)
  const deserialized = new JsonClassSerializer().deserialize(json, Person)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeClassWithoutClassHint() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serialize(person)
  const deserialized = new JsonClassSerializer().deserialize(json, undefined)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeClassWithOnlyAlternativeTypeProperty() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serialize(person)
  const obj = JSON.parse(json)
  delete obj['#type']

  assertEquals(obj['#type'], undefined)
  assertEquals(obj['__type'], 'Person')
  const deserialized = new JsonClassSerializer().deserializeFromObject(obj, undefined)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeClassWithinPlainObject() {
  const person = createTestPerson()
  const obj = { foo: { bar: { baz: [person] } } }
  const jsc = new JsonClassSerializer
  const json = jsc.serialize(obj)
  
  const plainObj = JSON.parse(json)
  assertEquals(plainObj.foo.bar.baz[0]['#type'], 'Person')
  
  const deserialized = new JsonClassSerializer().deserialize(json)
  assertSimilarInstances(deserialized, obj)
});

Deno.test(function serializeVmProxyOfClassInstance() {
  const person = createTestPerson()

  let wasConstructorAccessed = false
  const proxy = new Proxy(person, {
    get(target, prop) {
      if(prop === 'constructor') {
        wasConstructorAccessed = true
        return Object
      }
      return Reflect.get(target, prop)
    }
  })

  const jsc = new JsonClassSerializer
  const json = jsc.serialize(proxy)
  assertEquals(wasConstructorAccessed, true)
  const deserialized = new JsonClassSerializer().deserialize(json, undefined)
  assertSimilarInstances(deserialized, person)
});