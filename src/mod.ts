export { JsonClassSerializer } from './json-class-serializer.ts'
export {
	jsonClass,
	jsonProperty,
	jsonArrayProperty,
	jsonMapProperty,
	jsonSetProperty,
	jsonAnyProperty,
	jsonEnumProperty,
	jsonLiteralProperty,
	ClassDataSymbol,
	getClassMetadata,
	listRegisteredClasses,
} from './metadata.ts'
export type { ClassMetadata, PropertyMetadata } from './metadata.ts'
export { getJsonClassName } from './utils.ts'
export type {
	JsonClassSerializerOptions,
	JsonClassOptions,
	JsonPropertyOptions,
	JsonEnumPropertyOptions,
	JsonSchema,
	JsonSchemaObject,
	JsonSchemaAnnotations,
	JsonSchemaOverride,
	Ctor,
} from './types.ts'
export { AnyType } from './types.ts'
