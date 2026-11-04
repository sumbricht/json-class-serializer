# JSON Class Serializer

Turns decorated class instances into JSON and back, and describes that JSON as a schema.

## Language

**Registered name**:
The name a class carries in serialized JSON, set by `@jsonClass` (or a key of `additionalClassesToConsider`).
_Avoid_: class name, type name

**Discriminator**:
The property of a serialized object that holds the registered name of its class (`serializationPropertyName`).
_Avoid_: type property, type field

**Declared class**:
The class a property, item, map key or map value is declared with in its decorator.
_Avoid_: base class, property type

**Runtime class**:
The class of the actual value being serialized; may be the declared class or a subclass of it.

**Abstract class**:
A class marked as having no instances of its own, so a discriminator must always select a subclass.

**Custom-serialized class**:
A class whose class-level serializer or deserializer defines its JSON instead of its decorated properties.

**Polymorphic position**:
A property, item or map value whose declared class has subclasses the discriminator can select.

**Dispatch**:
The choice of runtime class at a polymorphic position, made from the discriminator.

**Dispatch branch**:
A class a dispatch can select: named, not abstract, not custom-serialized, and a subclass of (or equal to) the declared class.
_Avoid_: variant, subtype
