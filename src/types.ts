// deno-lint-ignore no-unused-vars
import type { JsonClassSerializer } from "./json-class-serializer.ts"; // used for JsDoc

const primitiveFactoryFns = [String, Number, Boolean, Date, BigInt] as const
export type Ctor = abstract new (...args: any[]) => any
export type Thunk<T> = () => T
export type MaybeThunk<T> = T | Thunk<T>
export type CtorOrThunk = MaybeThunk<Ctor> | typeof primitiveFactoryFns[number]
export type EntryOrKeyValue = [string, any] | { key: string, value: any }
export type Deserialized<Input, T extends Ctor> = Input extends InstanceType<T>
	? Input
	: Input extends Array<infer U>
		? U extends InstanceType<T>
			? Input
			: InstanceType<T>[]
		: InstanceType<T>

export type PropertyType = 'class' | 'array' | 'map' | 'set' | 'any'
export type PropertyKey = string | number | symbol

/**
 * Pseudo-type for usage in {@link jsonProperty}, {@link jsonArrayProperty}, {@link jsonMapProperty}, {@link jsonSetProperty} to indicate that the property value / collection value / key can be of any type.
 */
export const AnyType = undefined

/**
 * Options for configuring how JsonClassSerializer treats the property annotated with `@jsonProperty`.
 */
export interface JsonPropertyOptions {
	serializer?: (value: any) => any
	deserializer?: (value: any) => any
}

/**
 * Options for configuring how JsonClassSerializer treats the class annotated with `@jsonClass`.
 */
export interface JsonClassOptions {
	serializer?: (value: any) => any
	deserializer?: (value: any) => any
}

export type JsonProperty = {
	options: JsonPropertyOptions
} & (
	{
		type: 'class'
		valueCtorOrThunk?: CtorOrThunk
	} |	{
		type: 'array' | 'set'
		valueCtorOrThunk?: CtorOrThunk
	} | {
		type: 'map'
		keyCtorOrThunk?: CtorOrThunk
		valueCtorOrThunk?: CtorOrThunk
	} | {
		type: 'any'
	}
)

export interface JsonClassData {
	ctor?: any
	name?: string
	options?: JsonClassOptions
	properties?: Map<PropertyKey, JsonProperty>
}

/**
 * Options for configuring the JSON class serializer.
 */
export interface JsonClassSerializerOptions {
	/**
	 * Property to write class name to in serialized JSON (e.g. `'#type'` to produce `'{"#type":"Person",...}'. Default: '#type'`).
	 */
	serializationPropertyName: string;
	
	/**
	 * Function to resolve the class (or its name) for serialization. Only used if the class to be used for serialization is not known from the context or the ctor (constructor) input property of {@link JsonClassSerializer.deserializeFromJson} / {@link JsonClassSerializer.deserializeFromObject}. Default: undefined
	 * @param obj - The object being serialized.
	 * @param options - The effective options for the serializer.
	 * @returns The class itself or the class name as a string.
	 */
	serializationClassResolver: ((obj: any, options: EffectiveJsonClassSerializerOptions) => Ctor | string) | undefined;
	
	/**
	 * Function to resolve the class (or its name) for deserialization. By default, it uses the value of {@link JsonClassSerializerOptions.serializationPropertyName | options.serializationPropertyName} as a key in the object to be deserialized.
	 * 
	 * @param obj - The object being deserialized.
	 * @param options - The effective options for the serializer.
	 * @returns The class itself or the class name as a string.
	 */
	deserializationClassResolver: ((obj: any, options: EffectiveJsonClassSerializerOptions) => Ctor | string) | undefined;
	
	/**
	 * Whether to use the global class registry (all classes that were annotate with @jsonClass) to resolve class names. Default: true
	 */
	useGlobalClassRegistry: boolean;

	/** 
	 * Additional classes to consider when looking up a type by name (Record with class names as keys and constructor functions as values). This is evaluated before the global class registry. Default: {}
	 */
	additionalClassesToConsider: MaybeThunk<Record<string, Ctor>>;
	
	/**
	 * Whether to fail if the root class is not found during deserialization. Default: true
	 */
	failIfRootClassNotFound: boolean;

	/**
	 * Strategy for serializing maps.
	 * - `'arrayOfEntries'` (default): Serialize maps as an array of entries ([["key1","value1"],["key2","value2"]]).
	 * - `'arrayOfKeyValueObjects'`: Serialize maps as an array of key-value objects ([{"key":"key1"},{"value":"value1"},{"key":"key2"},{"value":"value2"}]).
	 */
	mapSerializationStrategy: 'arrayOfEntries' | 'arrayOfKeyValueObjects';
	
	/**
	 * Whether to pretty-print the serialized JSON.
	 * - `true`: Pretty-print using tabs for indentation.
	 * - `false`: Do not pretty-print.
	 * - `string`: Pretty-print using the specified string as indentation.
	 * - `number`: Pretty-print using the specified number of spaces for indentation.
	 */
	prettyPrint: boolean | string | number;
}

export interface EffectiveJsonClassSerializerOptions extends JsonClassSerializerOptions {
	/**
	 * Function to resolve the class name for serialization. Default: `ctor => ctor.name`.
	 * {link JsonClassSerializer.defaultOptions.classNameResolver} needs to be set before any classes annotated with {@link jsonClass} are loaded, if you desire to implement a custom name resolver.
	 * @param ctor - The class (constructor).
	 * @returns The class name as a string.
	 */
	classNameResolver: (ctor: Ctor) => string;
}

export function isThunk<T>(value: MaybeThunk<T>): value is Thunk<T> {
	if(typeof value !== 'function') return false
	if(primitiveFactoryFns.includes(value as any)) return false
	return !value.prototype // prototype is undefined for arrow functions; treat these as thunks
}

export function resolveThunk<T>(value: MaybeThunk<T>): T {
	return isThunk(value) ? value() : value
}