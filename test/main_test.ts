import { assert, assertEquals,  } from "@std/assert";
import { classDataByCtor, ClassDataSymbol, jsonArrayProperty, jsonClass, jsonMapProperty, jsonProperty, jsonSetProperty } from "../src/metadata.ts";
import { JsonClassSerializer } from "../src/json-class-serializer.ts";
import { assertSimilarInstances } from "./test-util.ts";
import { getJsonClassName } from "../src/utils.ts";
import { AnyType } from "../src/types.ts";

@jsonClass()
class Address {
  @jsonProperty(String)
  city: string = ''
  hidden?: string = 'SHOULD NEVER SHOW IN JSON'

  constructor(init: Address) {
    Object.assign(this, init)
  }
}

@jsonClass()
class Nationality {
  @jsonProperty()
  country: string = ''

  constructor(init: Nationality) {
    Object.assign(this, init)
  }
}

@jsonClass(undefined, {
  serializer: (value: Account) => `${value.currency} ${value.balance}`,
  deserializer: (value: string) => {
    const [currency, balanceStr] = value.split(' ')
    return { currency, balance: Number(balanceStr) }
  }
})
class Account {
  @jsonProperty()
  currency: string = 'USD'
  @jsonProperty()
  balance: number = 0

  constructor(init: Account) {
    Object.assign(this, init)
  }
}

@jsonClass()
class Person {
  @jsonProperty()
  get __type() { return 'Person' }
  @jsonProperty(() => String)
  name: string = ''
  @jsonProperty(Date)
  dob: Date = new Date('1900-01-01')
  @jsonProperty(Number)
  numberOfChildren: number = 0
  @jsonProperty(Boolean)
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

  @jsonArrayProperty(() => Account, {
    serializer: (value: Account[]) => value?.map((acc, idx) => [idx, acc]),
    deserializer: (value: [number, Account][]) => value?.map(([_, acc]) => acc),
  })
  accounts: Account[] = []

  constructor(init?: Omit<Person, '__type'>) {
    if(init) Object.assign(this, init)
  }

  static createMinimal(properties: Partial<Person>) {
    return new Person(properties as any)
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
    ['Alice', Person.createMinimal({ name: 'Alice', dob: new Date('2010-01-01') })],
    ['Bob', Person.createMinimal({ name: 'Bob', dob: new Date('2012-01-01') })],
  ]),
  accounts: [
    new Account({ currency: 'USD', balance: 1000.25 }),
    new Account({ currency: 'EUR', balance: 2000 }),
  ],
})


Deno.test(function serializeObjectWithPrimitives() {
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson({ a: 1, b: "2", c: true, d: new Date('2000-01-01') })
  assertEquals(json, '{"a":1,"b":"2","c":true,"d":"2000-01-01T00:00:00.000Z"}')
});

Deno.test(function serializeClassProperties() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(person)
  assertEquals(json, '{"#type":"Person","__type":"Person","name":"John","dob":"2000-01-01T00:00:00.000Z","numberOfChildren":2,"isMarried":true,"address":{"city":"New York"},"accountBalance":"9007199254740991000","nationalities":[{"country":"Switzerland"},{"country":"USA"}],"nicknames":["Johnny","John"],"children":[["Alice",{"__type":"Person","name":"Alice","dob":"2010-01-01T00:00:00.000Z","numberOfChildren":0,"isMarried":false,"accountBalance":"0","nationalities":[],"nicknames":[],"children":[],"accounts":[]}],["Bob",{"__type":"Person","name":"Bob","dob":"2012-01-01T00:00:00.000Z","numberOfChildren":0,"isMarried":false,"accountBalance":"0","nationalities":[],"nicknames":[],"children":[],"accounts":[]}]],"accounts":[[0,"USD 1000.25"],[1,"EUR 2000"]]}')
});

Deno.test(function serializeViaJsonStringify() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const jsonFromJsc = jsc.serializeToJson(person)
  const jsonFromJsonStringify = JSON.stringify(person)
  assertEquals(jsonFromJsc, jsonFromJsonStringify)
});

Deno.test(function deserializeClassWithClassHint() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(person)
  const deserialized = new JsonClassSerializer().deserializeFromJson(json, Person)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeClassWithoutClassHint() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(person)
  const deserialized = new JsonClassSerializer().deserializeFromJson(json, undefined)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeClassWithOnlyAlternativeTypeProperty() {
  const person = createTestPerson()
  const jsc = new JsonClassSerializer({ serializationPropertyName: '__type' })
  const json = jsc.serializeToJson(person)
  const obj = JSON.parse(json)

  assertEquals(obj['#type'], undefined)
  assertEquals(obj['__type'], 'Person')
  const deserialized = jsc.deserializeFromObject(obj, undefined)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function deserializeWithManualClassResolution() {
  const json = '{"name":"John"}'
  const minimalPersonData: Partial<Person> = { name: 'John' }
  const minimalPerson = Person.createMinimal(minimalPersonData);
  
  const deserializedWithoutResolution = new JsonClassSerializer().deserializeFromJson(json)
  assertSimilarInstances(deserializedWithoutResolution, minimalPersonData)

  const deserializedWithClassHint = new JsonClassSerializer().deserializeFromJson(json, Person)
  assertSimilarInstances(deserializedWithClassHint, minimalPerson)

  const deserializedWithNameResolution = new JsonClassSerializer({ deserializationClassResolver: () => 'Person' }).deserializeFromJson(json)
  assertSimilarInstances(deserializedWithNameResolution, minimalPerson)

  const deserializedWithClassResolution = new JsonClassSerializer({ deserializationClassResolver: () => Person }).deserializeFromJson(json)
  assertSimilarInstances(deserializedWithClassResolution, minimalPerson)
})

Deno.test(function deserializeClassWithinPlainObject() {
  const person = createTestPerson()
  const obj = { foo: { bar: { baz: [person] } } }
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(obj)
  
  const plainObj = JSON.parse(json)
  assertEquals(plainObj.foo.bar.baz[0]['#type'], 'Person')
  
  const deserialized = new JsonClassSerializer().deserializeFromJson(json)
  assertSimilarInstances(deserialized, obj)
});

Deno.test(function deserializeNestedStructures() {
  @jsonClass('Person_deserializeNestedStructures')
  class Person {
    @jsonProperty(AnyType)
    addresses: Record<string, Address[]> = {}

    constructor(init: Person) {
      Object.assign(this, init)
    }
  }

  const person = new Person({
    addresses: {
      home: [
        new Address({ city: 'New York' }),
        new Address({ city: 'Los Angeles' }),
      ],
      work: [
        new Address({ city: 'San Francisco' }),
      ]
    }
  })
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(person)
  const deserialized = jsc.deserializeFromJson(json, Person)
  assertSimilarInstances(deserialized, person)
})

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
  const json = jsc.serializeToJson(proxy)
  assertEquals(wasConstructorAccessed, true)
  const deserialized = new JsonClassSerializer().deserializeFromJson(json, undefined)
  assertSimilarInstances(deserialized, person)
});

Deno.test(function serializeWithPrettyPrint() {
  const obj = { foo: { bar: { baz: [1, 2, 3] } } }
  function serializeWithSpace(space: boolean | string | number) {
    const jsc = new JsonClassSerializer({ prettyPrint: space })
    return jsc.serializeToJson(obj)
  }
  const jsonTrue = serializeWithSpace(true)
  const jsonFalse = serializeWithSpace(false)
  const jsonNumber = serializeWithSpace(3)
  const jsonString = serializeWithSpace('   ')
  assertEquals(jsonTrue, `{\n\t"foo": {\n\t\t"bar": {\n\t\t\t"baz": [\n\t\t\t\t1,\n\t\t\t\t2,\n\t\t\t\t3\n\t\t\t]\n\t\t}\n\t}\n}`)
  assertEquals(jsonFalse, '{"foo":{"bar":{"baz":[1,2,3]}}}')
  assertEquals(jsonNumber, `{\n   "foo": {\n      "bar": {\n         "baz": [\n            1,\n            2,\n            3\n         ]\n      }\n   }\n}`)
  assertEquals(jsonString, `{\n   "foo": {\n      "bar": {\n         "baz": [\n            1,\n            2,\n            3\n         ]\n      }\n   }\n}`)
})

Deno.test(function classInstanceHasJsonClassData() {
  const person = createTestPerson()
  const classData = (person as any)[ClassDataSymbol];
  assert(classData)
  assertEquals(classData, classDataByCtor.get(Person))
});

Deno.test(function mapSerializationStrategyKeyValueObjects() {
  @jsonClass()
  class Settings {
    @jsonMapProperty(String, Number)
    map: Map<string, number>

    constructor(map: Map<string, number>) {
      this.map = map
    }
  }
  const map = new Settings(new Map([
    ['a', 1],
    ['b', 2],
  ]))
  const jsc = new JsonClassSerializer({ mapSerializationStrategy: 'arrayOfKeyValueObjects' })
  const json = jsc.serializeToJson(map)
  assertEquals(json, '{"#type":"Settings","map":[{"key":"a","value":1},{"key":"b","value":2}]}')
  
  const deserializedWithKeyValueStrategy = jsc.deserializeFromJson(json)
  assertSimilarInstances(deserializedWithKeyValueStrategy, map)

  const deserializedWithEntriesStrategy = new JsonClassSerializer({ mapSerializationStrategy: 'arrayOfEntries' }).deserializeFromJson(json)
  assertSimilarInstances(deserializedWithEntriesStrategy, map)
});

Deno.test(function classInstanceWithInheritance() {
  class Animal {
    @jsonProperty()
    name: string = ''
  }
  @jsonClass()
  class Cat extends Animal {
    @jsonProperty()
    character: 'lazy' | 'evil' = 'evil'
    @jsonProperty()
    fur: 'fuzzy' | 'short' = 'short'

    constructor(init: Cat) {
      super()
      Object.assign(this, init)
    }
  }

  const cat = new Cat({ name: 'Tom', character: 'lazy', fur: 'fuzzy' })
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(cat)
  assertEquals(json, '{"#type":"Cat","name":"Tom","character":"lazy","fur":"fuzzy"}')
  const deserialized = jsc.deserializeFromJson(json, Cat)
  assertSimilarInstances(deserialized, cat)
});

Deno.test(function onlyDeserializePropertiesInJson() {
  const minimalPerson = new Person()
  minimalPerson.name = 'John'
  
  const minimalJson = '{"#type":"Person","name":"John"}'
  const jsc = new JsonClassSerializer
  const deserialized = jsc.deserializeFromJson(minimalJson, undefined)
  assertSimilarInstances(deserialized, minimalPerson)
})

Deno.test(function utilGetJsonClassName() {
  class Animal {}
  @jsonClass()
  class Cat extends Animal {}
  @jsonClass('Fuzzy cat')
  class FuzzyCat extends Cat {}
  
  assertEquals(getJsonClassName(Animal), 'Animal')
  assertEquals(getJsonClassName(Cat), 'Cat')
  assertEquals(getJsonClassName(FuzzyCat), 'Fuzzy cat')
  assertEquals(getJsonClassName(new Animal), 'Animal')
  assertEquals(getJsonClassName(new Cat), 'Cat')
  assertEquals(getJsonClassName(new FuzzyCat), 'Fuzzy cat')
})

Deno.test(function anyTypeProperties() {
  @jsonClass()
  class Foo {
    @jsonProperty()
    obj: any
    @jsonArrayProperty(AnyType)
    array!: any[]
    @jsonMapProperty(AnyType, AnyType)
    map!: Map<any, any>
    @jsonSetProperty(AnyType)
    set!: Set<any>

    constructor(init: Foo) {
      Object.assign(this, init)
    }
  }

  const foo = new Foo({
    obj: { a: 1, b: '2', c: true },
    array: [1, '2', true],
    map: new Map<any, any>([[1, 'a'], ['b', 2]]),
    set: new Set([1, '2', true]),
  })
  const jsc = new JsonClassSerializer
  const json = jsc.serializeToJson(foo)
  assertEquals(json, '{"#type":"Foo","obj":{"a":1,"b":"2","c":true},"array":[1,"2",true],"map":[[1,"a"],["b",2]],"set":[1,"2",true]}')
  const deserialized = jsc.deserializeFromJson(json, Foo)
  assertSimilarInstances(deserialized, foo)
})

Deno.test(function serializeBinaryData() {
  const jsc = new JsonClassSerializer

  const uint8Array = new Uint8Array(new Array(256 * 4 + 1).fill(0).map((_, idx) => idx % 256))
  const arrayBuffer = uint8Array.buffer
  const dataView = new DataView(arrayBuffer)

  const jsonUint8 = jsc.serializeToJson(uint8Array)
  const jsonArrayBuffer = jsc.serializeToJson(arrayBuffer)
  const jsonDataView = jsc.serializeToJson(dataView)
  assertEquals(jsonArrayBuffer, jsonUint8)
  assertEquals(jsonDataView, jsonUint8)

  const deserializedArrayBuffer = jsc.deserializeFromJson(jsonArrayBuffer, ArrayBuffer)
  const deserializedUint8 = jsc.deserializeFromJson(jsonUint8, Uint8Array)
  const deserializedDataView = jsc.deserializeFromJson(jsonDataView, DataView)
  assertSimilarInstances(deserializedArrayBuffer, arrayBuffer)
  assertSimilarInstances(deserializedUint8, uint8Array)
  assertSimilarInstances(deserializedDataView, dataView)
})