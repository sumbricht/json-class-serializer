import { JsonClassSerializer } from "./mod.ts";
import { Ctor, CtorOrThunk, JsonClassData, JsonPropertyOptions, JsonProperty, MaybeThunk, resolveThunk, JsonClassOptions, AnyType } from "./types.ts";
import { arrayBufferToBase64, base64ToArrayBuffer, base64ToDataView, base64ToUint8Array, dataViewToBase64, uint8ArrayToBase64 } from "./utils.ts";


export const classDataByCtor = new WeakMap<any, JsonClassData>([
	[Date, { factoryFn: (value: string) => new Date(value) }],
	[String, { factoryFn: (value: string) => String(value) }],
	[Number, { factoryFn: (value: number) => Number(value) }],
	[Boolean, { factoryFn: (value: boolean) => Boolean(value) }],
	[BigInt, { factoryFn: (value: string) => BigInt(value) }],
	[ArrayBuffer, { factoryFn: base64ToArrayBuffer, options: { serializer: arrayBufferToBase64, deserializer: base64ToArrayBuffer } }],
	[Uint8Array, { factoryFn: base64ToUint8Array, options: { serializer: uint8ArrayToBase64, deserializer: base64ToUint8Array } }],
	[DataView, { factoryFn: base64ToDataView, options: { serializer: dataViewToBase64, deserializer: base64ToDataView } }],
])
export const classDataByName = new Map<string, JsonClassData>()
export const ClassDataSymbol = Symbol.for('JsonClassData')

export function jsonClass(name?: MaybeThunk<string>, options: JsonClassOptions = {}): ClassDecorator {
	return (ctor: any) => {
		const data = ensureJsonClassData(ctor)
		data.name = resolveThunk(name) || JsonClassSerializer.defaultOptions.classNameResolver(ctor)
		data.ctor = ctor
		data.options = options
		classDataByName.set(data.name, data)
		ctor.prototype[ClassDataSymbol] = data

		ctor.prototype.toJSON = function() {
			const jsc = JsonClassSerializer.defaultInstance
			return jsc.serializeToObject(this)
		}
	}
}

export function jsonProperty(ctorOrThunk?: CtorOrThunk, options: JsonPropertyOptions = {}): PropertyDecorator {
	return function(target: any, propertyKey: string | symbol) {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'class',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

export function jsonArrayProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'array',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

export function jsonMapProperty(keyCtorOrThunk: CtorOrThunk | typeof AnyType, valueCtorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'map',
			options,
			keyCtorOrThunk,
			valueCtorOrThunk
		})
	}
}

export function jsonSetProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'set',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

export function jsonAnyProperty(options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'any',
			options,
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