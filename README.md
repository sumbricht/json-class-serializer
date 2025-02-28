[![npm version](https://img.shields.io/npm/v/@sumbricht/json-class-serializer.svg?logo=npm&style=for-the-badge)](https://www.npmjs.com/package/@sumbricht/json-class-serializer)
[![Build Status](https://img.shields.io/npm/l/@sumbricht/json-class-serializer?&style=for-the-badge&color=green)
](https://github.com/JohnWeisz/@sumbricht/json-class-serializer/blob/master/LICENSE)

Serializing and deserializing of TypeScript classes and objects to/from JSON strings and plain objects.Work by annotating classes and their properties with [TypeScript decorators](https://github.com/Microsoft/TypeScript-Handbook/blob/master/pages/Decorators.md).

JsonClassSerializer can correctly handle the following:
 - Classes with annotated properties of the following values:
   - Primitive types (string, number, boolean, Date, bigint)
   - Other classes
   - Plain JavaScript objects (even ones that have class instances nested deeply within)
   - Binary data as ArrayBuffer, Uint8Array or DataView
   - Arrays and Sets of any of the above
   - Maps with both keys and values of any of the above
 - Plain JavaScript objects, arrays and primitive values (NOTE: deserialzing Date objects needs a bit of configuration)

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

JsonClassSerializer uses decorators, and requires your classes to be annotated with `@jsonClass()`, and properties with `@jsonProperty` (or the specific `@jsonArrayProperty`, `@jsonSetProperty`, and `@jsonMapProperty` decorators for collections, see below). Properties which are not annotated will not be serialized or deserialized.

### 1. Annotate the relevant classes with `@jsonClass()`

If you specify an optional name (e.g. `@jsonClass('Person')`), this will be used to identify the class when deserializing. Otherwise the class name itself is used.

*Note:* When code is minimized, a process called "mangling" is sometimes used to shorten variable and class names, which can make it necessary to explicitly specify a name.

### 2. Annotate all desired properties with a property decorator

*Note:* See [example class](#example-class) below for a hands-on example of all possible properties.
    
For single value properties, the decorator `@jsonProperty` is used, for collections it is one of `@jsonArrayProperty`, `@jsonSetProperty` or `@jsonMapProperty`.

Depending of the type of value that the property should store, use the following:
- **Class instance** such as `Address`: use the decorator `@jsonProperty(Address)` with explicit mention of the class constructor.
  
  You can also **lazily specify** the class constructor to avoid circular dependency issues by using an arrow function that returns the class construtor: `@jsonProperty(() => Address)`.
- **Primitive types** `String`, `Number` and `Boolean`: the type can be supplied, but it is not required; simply use `@jsonProperty()` instead of `@jsonProperty(String)`.
- **Primitive types** `Date` and `BigInt`: specifying the type is required. Use e.g. `@jsonProperty(Date)`
- **Binary types** `ArrayBuffer`, `Uint8Array` and `DataView`: specifying the type is required. Use e.g. `@jsonProperty(ArrayBuffer)`

For **collections**, the type of contained values (and for `Map` also the keys) have to specified explicitly. For classes and primitive types, use the corresponding constructor (e.g. `String` for type `string`). If the value should be treated as a plain JavaScript value, use `AnyType`:
- `Array`: e.g. `@jsonArrayProperty(Person)`, `@jsonArrayProperty(String)` or `@jsonArrayProperty(AnyType)`
- `Set`: e.g. `@jsonSetProperty(Role)`, `@jsonSetProperty(String)` or `@jsonSetProperty(AnyType)`
- `Map`: Provide both a type for key and value, e.g. `@jsonMapProperty(String, Person)`, `@jsonMapProperty(String, Number)` or `@jsonMapProperty(AnyType)`
- **Nested types** can be created using `@jsonProperty(AnyType)`. They may include a deeply nested mix of `String`, `Number`, `Boolean` (**not** `Date`/`BigInt`), arrays,plain JavaScript objects and class instances. Please note that only the mentioned types may be used **outside** of a class instance.

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


*Note:* unline other libraries such as [TypedJSON](https://github.com/JohnWeisz/TypedJSON), JsonClassSerializer does not utilize and type 

TypeScript needs to run with the `experimentalDecorators` option enabled.

### 3. Serialize / deserialize your data
Simple example:
```typescript
const person = new Person(/* ... */)
const jsc = JsonClassSerializer.defaultInstance

// serialize to either JSON or a plain object
const json = jsc.serializeToJson(person) // '{"#type":"Person","name":"John",...}
const plainObj = jsc.serializeToObject(person)

// deserialize without providing a root class for deserialization
const personFromJson = jsc.deserializeFromJson(json) as Person
const personFromObj = jsc.deserializeFromObject(plainObj) as Person

// deserialize providing a root class. This can also deserialize
const personFromJson = jsc.deserializeFromJson(json, Person) // -> Person
const personFromObj = jsc.deserializeFromObject(plainObj, Person) // -> Person
```

You can also customize the workings of the JsonClassSerializer default instance or create a separate instance. See auto-completion in your IDE for details of the individual options:
```typescript
const jsc = new JsonClassSerializer({
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
	mapSerializationStrategy: 'arrayOfKeyValueObjects' // default: 'arrayOfEntries'
	prettyPrint: true, // true: indent by tabs, number: indent by spaces, string: indent by given string, false: no pretty-print
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

    @jsonProperty(SocialSecurityDetails) // must include type constructor, could also be () => SocialSecurityDetails
    socialSecurityDetails: SocialSecurityDetails
  
  
    // collections
    @jsonProperty(String) // must include type constructor
    nationalities: string[] = []

    @jsonSetProperty(String) // must include type constructor
    nicknames: Set<string> = new Set()

    @jsonMapProperty(String, Person) // must include key and type constructors, could also be () => Person
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
```

## Attribution
This approach is heavily inspired by the great previous work by the creators of [TypedJSON](https://github.com/JohnWeisz/TypedJSON). TypedJSON unfortunately had not seen any updates for 4 years at the time of creating JsonClassSerializer and didn't work well under some more advanced circumstances (e.g. with binary data, with data crossing VM2 proxy boundaries, etc.).

## License
JsonClassSerializer is licensed under the MIT License.