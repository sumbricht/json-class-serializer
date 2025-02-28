const primitiveFactoryFns = [String, Number, Boolean, Date, BigInt] as const
export type Ctor = abstract new (...args: any[]) => any
export type Thunk<T> = () => T
export type MaybeThunk<T> = T | Thunk<T>
export type CtorOrThunk = MaybeThunk<Ctor> | typeof primitiveFactoryFns[number]
export type EntryOrKeyValue = [string, any] | { key: string, value: any }

export type PropertyType = 'class' | 'array' | 'map' | 'set' | 'any'
export type PropertyKey = string | number | symbol

export const AnyType = undefined

export interface JsonPropertyOptions {
	serializer?: (value: any) => any
	deserializer?: (value: any) => any
}

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
	factoryFn?: (value: any) => any
	name?: string
	options?: JsonClassOptions
	properties?: Map<PropertyKey, JsonProperty>
}

export interface JsonClassSerializerOptions {
	serializationNameResolver: (obj: any) => string
	deserializationNameResolver: (obj: any) => string
	mapSerializationStrategy: 'arrayOfEntries' | 'arrayOfKeyValueObjects'
	prettyPrint: boolean | string | number
}

export interface EffectiveJsonClassSerializerOptions extends JsonClassSerializerOptions {
	classNameResolver: (ctor: Ctor) => string
}

export function isThunk<T>(value: MaybeThunk<T>): value is Thunk<T> {
	if(typeof value !== 'function') return false
	if(primitiveFactoryFns.includes(value as any)) return false
	return !value.prototype // prototype is undefined for arrow functions; treat these as thunks
}

export function resolveThunk<T>(value: MaybeThunk<T>): T {
	return isThunk(value) ? value() : value
}