import { Ctor, CtorOrThunk, JsonClassData, JsonProperty, MaybeThunk, resolveThunk } from "./types.ts";


export const classDataByCtor = new WeakMap<Ctor, JsonClassData>([
	[Date, { factoryFn: (value: string) => new Date(value) }],
	[String, { factoryFn: (value: string) => String(value) }],
	[Number, { factoryFn: (value: number) => Number(value) }],
	[Boolean, { factoryFn: (value: boolean) => Boolean(value) }],
	[BigInt, { factoryFn: (value: string) => BigInt(value) }],
])
export const classDataByName = new Map<string, JsonClassData>()

export function jsonClass(name: MaybeThunk<string>): ClassDecorator {
	return (ctor: any) => {
		const data = ensureJsonClassData(ctor)
		data.name = resolveThunk(name)
		data.ctor = ctor
		classDataByName.set(data.name, data)
	}
}

export function jsonProperty(ctorOrThunk?: CtorOrThunk): PropertyDecorator {
	return function(target: any, propertyKey: string | symbol) {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'class',
			valueCtorOrThunk: ctorOrThunk
		})
	}
}
export function jsonArrayProperty(ctorOrThunk: CtorOrThunk): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'array',
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

export function jsonMapProperty(keyCtorOrThunk: CtorOrThunk, valueCtorOrThunk: CtorOrThunk): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'map',
			keyCtorOrThunk,
			valueCtorOrThunk
		})
	}
}

export function jsonSetProperty(ctorOrThunk: CtorOrThunk): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'set',
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

export function jsonAnyProperty(): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'any'
		})
	}
}

function ensureJsonClassData(ctor: any): JsonClassData {
	let data = classDataByCtor.get(ctor)
	if (!data) {
		data = {}
		classDataByCtor.set(ctor, data)
	}
	return data
}

function setPropertyInternal(ctor: Object, propertyKey: PropertyKey, propertyData: JsonProperty) {
	const data = ensureJsonClassData(ctor)
	if (!data.properties) data.properties = new Map()
	data.properties.set(propertyKey, propertyData)
}