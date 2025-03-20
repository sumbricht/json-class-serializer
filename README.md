[![npm version](https://img.shields.io/npm/v/@sumbricht/json-class-serializer.svg?logo=npm&style=for-the-badge)](https://www.npmjs.com/package/@sumbricht/json-class-serializer)
[![jsr version](https://img.shields.io/jsr/v/@sumbricht/json-class-serializer.svg?logo=jsr&style=for-the-badge)](https://jsr.io/@sumbricht/json-class-serializer)
[![License](https://img.shields.io/github/license/sumbricht/json-class-serializer?&style=for-the-badge&color=green)
](https://github.com/sumbricht/json-class-serializer/blob/master/LICENSE)

Serializing and deserializing of TypeScript classes and objects to/from JSON strings and plain objects. This works by annotating classes and their properties with [TypeScript decorators](https://github.com/Microsoft/TypeScript-Handbook/blob/master/pages/Decorators.md).

JsonClassSerializer can correctly handle the following:
 - Classes with annotated properties of the following values:
   - Primitive types (string, number, boolean, bigint)
   - Other classes
   - Plain JavaScript objects (even ones that have class instances nested deeply within)
   - Binary data as ArrayBuffer, Uint8Array or DataView
   - Dates and new [Temporal](https://tc39.es/proposal-temporal) types (if available in runtime; if using a polyfill, Temporal types may require explicit registration in the JsonClassSerializer instance)
   - Arrays and Sets of any of the above
   - Maps with both keys and values of any of the above
 - Plain JavaScript objects, arrays and primitive values (*Note:* deserialzing Date objects needs a bit of configuration)
 - Circular references (and multiple instances of same object) in classes and plain JavaScript objects (configuration option needed)

## Installation

JsonClassSerializer is available from npm and jsr, both for browser (e.g. using webpack) and NodeJS / Deno / Bun as ESM and CJS modules:

**For NodeJS** (use any one of the lines below)
```
npm install @sumbricht/json-class-serializer
npx jsr add @sumbricht/json-class-serializer
```

**For Deno**
```
deno add jsr:@sumbricht/json-class-serializer
```

## How to use

JsonClassSerializer uses decorators, and requires your class properties to be annotated with `@jsonProperty` (or the specific `@jsonArrayProperty`, `@jsonSetProperty`, and `@jsonMapProperty` decorators for collections, see below). Properties which are not annotated will not be serialized or deserialized.

Annotation of classes with `@jsonClass()` is optional but recommended (see below).

### 1. Annotate the relevant classes with `@jsonClass()`

Annotating a class with `@jsonClass` serves two purposes:
- Registering the class globally with `@jsonClass('Person')` allows it to be instantiated using `jcs.deserializeFromJson('{"#type":"Person",...}')` without passing the root class constructor `Person`. If you didn't register the class globally (or as an additional class when creating the `JsonClassSerializer`), you have to pass the root class explicitly: `jcs.deserializeFromJson('{"#type":"Person",...}', Person)`, which would even work if no type information was present in the JSON string (`jcs.deserializeFromJson('{...}', Person)`)
- Configuring a class serializer / deserializer if desired. This would allow any kind of serialization / deserialization. A class could even be serialzed to a single string (see [example class](#example-class) below).

If you specify an optional name (e.g. `@jsonClass('Person')`), this will be used to identify the class when deserializing. Otherwise the class name itself is used.

*Note:* When code is minimized, a process called "mangling" is sometimes used to shorten variable and class names, which can make it necessary to explicitly specify a name in the `@jsonClass` decorator.

### 2. Annotate all desired properties with a property decorator

*Note:* See [example class](#example-class) below for a hands-on example of all possible properties.
    
For single value properties, the decorator `@jsonProperty` is used, for collections it is one of `@jsonArrayProperty`, `@jsonSetProperty` or `@jsonMapProperty`.

Depending of the type of value that the property should store, use the following:
- **Class instance** such as `Address`: use the decorator `@jsonProperty(Address)` with explicit mention of the class constructor.
  
  You can also **lazily specify** the class constructor to avoid circular dependency issues by using an arrow function that returns the class constructor: `@jsonProperty(() => Address)`.
- **Primitive types** `String`, `Number` and `Boolean`: the type can be supplied, but it is not required; simply use `@jsonProperty()` instead of `@jsonProperty(String)`.
- **Primitive types** `Date` and `BigInt`: specifying the type is required. Use e.g. `@jsonProperty(Date)`
- **Binary types** `ArrayBuffer`, `Uint8Array` and `DataView`: specifying the type is required. Use e.g. `@jsonProperty(ArrayBuffer)`

For **collections**, the type of contained values (and for `Map` also the keys) have to specified explicitly. For classes and primitive types, use the corresponding constructor (e.g. `String` for type `string`). If the value should be treated as a plain JavaScript value, use `AnyType`:
- `Array`: e.g. `@jsonArrayProperty(Person)`, `@jsonArrayProperty(String)` or `@jsonArrayProperty(AnyType)`
- `Set`: e.g. `@jsonSetProperty(Role)`, `@jsonSetProperty(String)` or `@jsonSetProperty(AnyType)`
- `Map`: Provide both a type for key and value, e.g. `@jsonMapProperty(String, Person)`, `@jsonMapProperty(String, Number)` or `@jsonMapProperty(AnyType)`
- **Nested types** can be created using `@jsonProperty(AnyType)`. They may include a deeply nested mix of `String`, `Number`, `Boolean` (**not** `Date`/`BigInt`), arrays, plain JavaScript objects and class instances. Please note that only the mentioned types may be used **outside** of a class instance.

    Legal example (note that `Date` is only used within a class):
    ```typescript
    type Location = 'home' | 'work'
    
    @jsonClass()
    class Building {
        @jsonProperty(Date)
        dateOfLastRenovation: Date // allowed inside class
    }

    @jsonClass()
    class Person {
        @jsonProperty(AnyType)
        addresses: Record<Location, {
            buildings: Building[]
        }>
    }
    ```

    Ilegal example (`Date` cannot be used outside a class as it would be deserialzed to a string, not a `Date` instance):
    ```typescript
    /* ... */
    @jsonClass()
    class Person {
        @jsonProperty(AnyType)
        addresses: Record<Location, {
            buildings: Building[]
            dateOfPurchase: Date // NOT ALLOWED OUTSIDE OF CLASS
        }>
    }
    ```


*Note:* unlike other libraries such as [TypedJSON](https://github.com/JohnWeisz/TypedJSON), JsonClassSerializer deliberately does not utilize the type declaration of class properties (the `: SomeType` part) in any way, as this can lead to large difficulties in avoiding cricular dependencies.

**Important:** TypeScript needs to run with the `experimentalDecorators` option enabled.

Add the following to your `tsconfig.json` (for NodeJS) or `deno.json` (for Deno):
```
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

### 3. Serialize / deserialize your data
Simple example:
```typescript
const person = new Person(/* ... */)
const jcs = JsonClassSerializer.defaultInstance

// serialize to either JSON or a plain object
const json = jcs.serializeToJson(person) // '{"#type":"Person","name":"John",...}
const plainObj = jcs.serializeToObject(person)

// deserialize without providing a root class for deserialization
const personFromJson = jcs.deserializeFromJson(json) as Person
const personFromObj = jcs.deserializeFromObject(plainObj) as Person

// deserialize providing a root class. This can also deserialize
const personFromJson = jcs.deserializeFromJson(json, Person) // -> Person
const personFromObj = jcs.deserializeFromObject(plainObj, Person) // -> Person
```

You can also customize the workings of the JsonClassSerializer default instance or create a separate instance. See auto-completion in your IDE for details of the individual options:
```typescript
const jcs = new JsonClassSerializer({
  serializationPropertyName: '__type', // default: '#type'
	serializationClassResolver: (obj, options) => {
    // You can return the type name and let JsonClassSerializer find the right class, or return constructur class directly
        
    return Person // serialize every object with unknown type as Person
  },
  deserializationClassResolver: (obj, options) => {
    // You can return the type name and let JsonClassSerializer find the right class, or return constructur class directly
        
    const typeName = obj?.[options.serializationPropertyName] // you could return typeName directly
    return knownTypesMap.get(typeName)
  },
  useGlobalClassRegistry: true, // default: true
  additionalClassesToConsider: { // default: {}
    'alternative-address': AlternativeAddress // would apply for '{"#type":"alternative-address",...}'
  },
  failIfTypeResolutionFails: false, // default: true
  failIfRootClassNotFound: false, // default: false
  failIfPlainObjectsFound: false, // default: false
	mapSerializationStrategy: 'arrayOfKeyValueObjects' // default: 'arrayOfEntries'
	prettyPrint: true, // true: indent by tabs, number: indent by spaces, string: indent by given string, false: no pretty-print. Default: false
  circularDependencyReferencePropertyName: '#ref', // default: null
})

// change defaults for all JsonClassSerializers that will be created in the future
JsonClassSerializer.defaultOptions.prettyPrint = true // same options as above

// change defaults for default instance (potentially already created before you get to set defaultOptions)
JsonClassSerializer.defaultInstance.options.prettyPrint = true // same options as above
```

### <a name="example-class"></a>Example class

The following example demonstrates an annotated class for serialization of all possible types of properties, and how to serialize to JSON / plain objects and back:

```typescript
import { jsonClass, jsonProperty, jsonArrayProperty, jsonSetProperty, jsonMapProperty, AnyType } from '@sumbricht/json-class-serializer';

@jsonClass()
class Person {
    // primitive types

    @jsonProperty() // type constructor is optional here
    name: string = ''

    @jsonProperty() // type constructor is optional here
    heightInCentimeters: number = 180

    @jsonProperty() // type constructor is optional here
    isMarried: boolean = false

    @jsonProperty(Date) // must include type constructor
    dob: Date = new Date('2000-01-01')
    
    @jsonProperty(BigInt) // must include type constructor
    accountBalance: bigint = BigInt(0)


    // other @jsonClass annotated class properties

    @jsonProperty(SocialSecurityDetails) // must include type constructor or lazy type () => SocialSecurityDetails
    socialSecurityDetails: SocialSecurityDetails
  
  
    // collections
    @jsonProperty(String) // must include type constructor
    nationalities: string[] = []

    @jsonSetProperty(String) // must include type constructor
    nicknames: Set<string> = new Set()

    @jsonMapProperty(String, Person) // must include key and type constructors or lazy type () => Person
    children: Map<string, Person> = new Map()


    // binary data; if not other preference, use ArrayBuffer
    @jsonProperty(ArrayBuffer)
    photo: ArrayBuffer

    @jsonProperty(Uint8Array)
    privateKey: Uint8Array

    @jsonMapProperty(String, DataView)
    identificationDocuments: Map<'passport' | 'id_card', DataView> = new Map


    // special use cases

    @jsonProperty() // age property will be included in serialized JSON. Without setter, it will not be deserialized
    get age() { return /* ... */ }

    @jsonProperty() // heightInInches property will be both serialzed and deserialized. @jsonProperty can be specified either on getter or setter
    get heightInInches() { /* ... */ }
    set heightInInches(inches) { /* ... */ }

    @jsonProperty(AnyType) // nested structures of any type
    addresses: Record<'home' | 'work', {
        buildings: Building[]
    }>

    // custom (de-)serialization of account to format "USD 12345.67"
    @jsonArrayProperty(() => Account, {
        serializer: (value: Account[]) => value?.map((acc, idx) => [idx, acc]),
        deserializer: (value: [number, Account][]) => value?.map(([_, acc]) => acc),
    })
    accounts: Account[] = []
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
    currency: string
    @jsonProperty()
    amount: number
}

@jsonClass()
class Address { /* ... */ }

@jsonClass()
class SocialSecurityDetails { /* ... */ }
```

## Special cases
### Circular dependencies / multiple instances of same object
When serializing data with circular dependencies, it is necessary to replace references to already encountered objects with a placeholder:

```typescript
@jsonClass('Person')
class Person {
  @jsonProperty(() => Person)
  parent: Person | undefined
  @jsonArrayProperty(() => Person)
  children: Person[] = []

  constructor(init: Partial<Person>) {
    Object.assign(this, init)
  }
}
const person = new Person({
  children: [
    new Person({})
  ]
})
person.children[0].parent = person // introduce circular dependency person -> children[0] -> parent

const obj = { person } // wrap in object to make the example more interesting

const jcs = new JsonClassSerializer({
  circularDependencyReferencePropertyName: '#ref'
})
const json = jcs.serializeToJson(obj) // circular reference is replaced by {#ref:["Person"]}, where ["Person"] is the path to the the referenced object relative to the root object that was serialized (obj in this case)
// '{"person":{"#type":"Person","children":[{"parent":{"#ref":["person"]},"children":[]}]}}'
```

When serializing data that have **no** circular dependencies, but the same object appears multiple times, the approach above should also be used to guarantee consistency. If such data are serialized and deserialized again without the option `circularDependencyReferencePropertyName`, the deserialized data don't reference the same object anymore, which may or may not be a problem depending on the use case:

```typescript
const childObj = { a: 1 }
const obj = {
  foo: childObj,
  bar: childObj,
} // obj.foo === obj.bar

const jcs = new JsonClassSerializer
const json = jcs.serializeToJson(obj)
// everything fine so far: '{"foo":{"a":1},"bar":{"a":1}}'

const deserialized = jcs.deserializeFromJson(json)
// deserialized.foo !== deserialized.bar; references don't point to same object anymore
```

## Attribution
This approach is heavily inspired by the great previous work by the creators of [TypedJSON](https://github.com/JohnWeisz/TypedJSON). TypedJSON unfortunately had not seen any updates for 4 years at the time of creating JsonClassSerializer and didn't work well under some more advanced circumstances (e.g. with binary data, with data crossing VM2 proxy boundaries, etc.).

## License
JsonClassSerializer is licensed under the MIT License.