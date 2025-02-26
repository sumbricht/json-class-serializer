export type Ctor = Function
export type Thunk<T> = () => T
export type MaybeThunk<T> = T | Thunk<T>
export type CtorOrThunk = MaybeThunk<Ctor>
export type PropertyType = 'class' | 'array' | 'map' | 'set' | 'any'
export type PropertyKey = string | number | symbol

export type JsonProperty = 
	{
		type: 'class'
		valueCtorOrThunk?: CtorOrThunk
	} |	{
		type: 'array' | 'set'
		valueCtorOrThunk: CtorOrThunk
	} | {
		type: 'map'
		keyCtorOrThunk: CtorOrThunk
		valueCtorOrThunk: CtorOrThunk
	} | {
		type: 'any'
	}

export interface JsonClassData {
	ctor?: any
	factoryFn?: (value: any) => any
	name?: string
	properties?: Map<PropertyKey, JsonProperty>
}

export function isThunk<T>(value: MaybeThunk<T>): value is Thunk<T> {
	return typeof value === 'function' && !value.prototype
}

export function resolveThunk<T>(value: MaybeThunk<T>): T {
	return isThunk(value) ? value() : value
}