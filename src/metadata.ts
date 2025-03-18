import { JsonClassSerializer } from "./mod.ts";
import type { CtorOrThunk, JsonClassData, JsonPropertyOptions, JsonProperty, MaybeThunk, JsonClassOptions, AnyType } from "./types.ts";
import { resolveThunk } from "./types.ts";
import { arrayBufferToBase64, base64ToArrayBuffer, base64ToDataView, base64ToUint8Array, dataViewToBase64, uint8ArrayToBase64 } from "./utils.ts";


export const classDataByCtor = new WeakMap<any, JsonClassData>([
	[String, { options: { deserializer: (value: string) => value } }],
	[Number, { options: { deserializer: (value: number) => value } }],
	[Boolean, { options: { deserializer: (value: boolean) => value } }],
	[Date, { options: { deserializer: (value: string) => new Date(value) } }],
	[BigInt, { options: { deserializer: (value: string) => BigInt(value) } }],
	[ArrayBuffer, { options: { serializer: arrayBufferToBase64, deserializer: base64ToArrayBuffer } }],
	[Uint8Array, { options: { serializer: uint8ArrayToBase64, deserializer: base64ToUint8Array } }],
	[DataView, { options: { serializer: dataViewToBase64, deserializer: base64ToDataView } }],
])
const { Temporal } = globalThis as any
if(Temporal) {
	// Temporal types are only available in environments that support Temporal
	classDataByCtor.set(Temporal.Instant, { options: { deserializer: (value: string) => Temporal.Instant.from(value) } })
	classDataByCtor.set(Temporal.PlainDate, { options: { deserializer: (value: string) => Temporal.PlainDate.from(value) } })
	classDataByCtor.set(Temporal.PlainTime, { options: { deserializer: (value: string) => Temporal.PlainTime.from(value) } })
	classDataByCtor.set(Temporal.PlainDateTime, { options: { deserializer: (value: string) => Temporal.PlainDateTime.from(value) } })
	classDataByCtor.set(Temporal.PlainYearMonth, { options: { deserializer: (value: string) => Temporal.PlainYearMonth.from(value) } })
	classDataByCtor.set(Temporal.PlainMonthDay, { options: { deserializer: (value: string) => Temporal.PlainMonthDay.from(value) } })
	classDataByCtor.set(Temporal.ZonedDateTime, { options: { deserializer: (value: string) => Temporal.ZonedDateTime.from(value) } })
	classDataByCtor.set(Temporal.Duration, { options: { deserializer: (value: string) => Temporal.Duration.from(value) } })
}

/**
 * Symbol that allows access to the global class registry (on `globalThis`) and class-specific metadata (on the class function).
 */
export const ClassDataSymbol = Symbol.for('JsonClassData')
export const classDataByName = (globalThis as any)[ClassDataSymbol] ?? new Map<string, JsonClassData>() // ensure only one instance of the map exists even if JsonClassSerializer is imported multiple times in separate chunks
;(globalThis as any)[ClassDataSymbol] = classDataByName

/**
 * Decorator to globally register a class for serialization/deserialization.
 * @param name The name of the class. If not provided, the class name will be used (explicitly provide a name if you use mangling during code minimization).
 * @param options Options for the class.
 */
export function jsonClass(name?: MaybeThunk<string | null>, options: JsonClassOptions = {}): ClassDecorator {
	return (ctor: any) => {
		const data = ensureJsonClassData(ctor)
		data.name = name !== null
			? resolveThunk(name) || JsonClassSerializer.defaultOptions.classNameResolver(ctor)
			: undefined
		data.ctor = ctor
		data.options = options
		ctor.prototype[ClassDataSymbol] = data
		if(data.name) {
			classDataByName.set(data.name, data)
		}

		ctor.prototype.toJSON = function() {
			const jsc = JsonClassSerializer.defaultInstance
			return jsc.serializeToObject(this)
		}
		ctor.prototype.toJSON[ClassDataSymbol] = true
	}
}

/**
 * Decorator to register a property for serialization/deserialization. Properties not decorated with this decorator will be ignored when serializing/deserializing.
 * @param ctorOrThunk The constructor of the property type, or an arrow function that returns the constructor of the property type. Must be provided unless the property type is string/number/boolean.
 * @param options Options for the property.
 */
export function jsonProperty(ctorOrThunk?: CtorOrThunk, options: JsonPropertyOptions = {}): PropertyDecorator {
	return function(target: any, propertyKey: string | symbol) {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'class',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as an array.
 * @param ctorOrThunk The constructor of the array item type, or an arrow function that returns the constructor of the array item type. Must always be set; if item typ is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonArrayProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'array',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as a map.
 * @param keyCtorOrThunk The constructor of the map key type, or an arrow function that returns the constructor of the map key type. Must always be set; if key type is string/number/boolean, provide String/Number/Boolean.
 * @param valueCtorOrThunk The constructor of the map value type, or an arrow function that returns the constructor of the map value type. Must always be set; if value type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
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

/**
 * Decorator to register a property for serialization/deserialization as a set.
 * @param ctorOrThunk The constructor of the set item type, or an arrow function that returns the constructor of the set item type. Must always be set; if item type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonSetProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'set',
			options,
			valueCtorOrThunk: ctorOrThunk
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as any type (same as `@jsonProperty(AnyType)`).
 * @param options Options for the property.
 */
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

function setPropertyInternal(ctor: object, propertyKey: PropertyKey, propertyData: JsonProperty) {
	const data = ensureJsonClassData(ctor)
	if (!data.properties) data.properties = new Map()
	data.properties.set(propertyKey, propertyData)
}