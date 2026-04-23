import { JsonClassSerializer } from './mod.ts'
import type {
	CtorOrThunk,
	JsonClassData,
	JsonPropertyOptions,
	JsonProperty,
	MaybeThunk,
	JsonClassOptions,
	AnyType,
} from './types.ts'
import { resolveThunk } from './types.ts'
import {
	arrayBufferToBase64,
	base64ToArrayBuffer,
	base64ToDataView,
	base64ToUint8Array,
	dataViewToBase64,
	uint8ArrayToBase64,
} from './utils.ts'

export const classDataByCtor = new WeakMap<any, JsonClassData>([
	[String, { options: { deserializer: (value: string) => value } }],
	[Number, { options: { deserializer: (value: number) => value } }],
	[Boolean, { options: { deserializer: (value: boolean) => value } }],
	[
		Date,
		{
			options: {
				serializer: (value: Date) =>
					value ? { '#date': value.toISOString() } : value,
				deserializer: (value: { '#date': string } | string) => {
					if (!value) return value
					if (typeof value === 'string') return new Date(value)
					return new Date(value['#date'])
				},
			},
		},
	],
	[
		BigInt,
		{
			options: {
				serializer: (value: bigint) =>
					value !== undefined ? { '#bigInt': value.toString() } : value,
				deserializer: (value: { '#bigInt': string } | bigint) => {
					if (!value) return value
					if (typeof value === 'bigint') return value
					return BigInt(value['#bigInt'])
				},
			},
		},
	],
	[
		ArrayBuffer,
		{
			options: {
				serializer: (arrayBuffer: ArrayBuffer) =>
					arrayBuffer
						? {
								'#arrayBuffer': arrayBufferToBase64(arrayBuffer),
							}
						: arrayBuffer,
				deserializer: (value: { '#arrayBuffer': string } | ArrayBuffer) => {
					if (!value) return value
					if (value instanceof ArrayBuffer) return value
					return base64ToArrayBuffer(value['#arrayBuffer'])
				},
			},
		},
	],
	[
		Uint8Array,
		{
			options: {
				serializer: (uint8Array: Uint8Array) =>
					uint8Array
						? {
								'#uint8Array': uint8ArrayToBase64(uint8Array),
							}
						: uint8Array,
				deserializer: (value: { '#uint8Array': string } | Uint8Array) => {
					if (!value) return value
					if (value instanceof Uint8Array) return value
					return base64ToUint8Array(value['#uint8Array'])
				},
			},
		},
	],
	[
		DataView,
		{
			options: {
				serializer: (dataView: DataView) =>
					dataView
						? {
								'#dataView': dataViewToBase64(dataView),
							}
						: dataView,
				deserializer: (value: { '#dataView': string } | DataView) => {
					if (!value) return value
					if (value instanceof DataView) return value
					return base64ToDataView(value['#dataView'])
				},
			},
		},
	],
	[
		Symbol,
		{
			options: {
				serializer: (value: symbol) => {
					if (!value) return value
					const description = value.description!
					const newSymbol = Symbol.for(description)
					if (newSymbol !== value) {
						throw new Error(
							`Cannot serialize Symbol ${description} as it is not a unique symbol`,
						)
					}
					return { '#symbol': description }
				},
				deserializer: (value: { '#symbol': string } | symbol) => {
					if (!value) return value
					if (typeof value === 'symbol') return value
					const description = value['#symbol']
					return Symbol.for(description)
				},
			},
		},
	],
])
export const deserializionClassByMagicPropertyName = new Map<string, any>([
	['#date', Date],
	['#arrayBuffer', ArrayBuffer],
	['#uint8Array', Uint8Array],
	['#dataView', DataView],
	['#symbol', Symbol],
])
const { Buffer, Temporal } = globalThis as any
if (Buffer) {
	classDataByCtor.set(Buffer, {
		options: {
			serializer: (buffer: typeof Buffer) => ({
				'#buffer': buffer.toString('base64'),
			}),
			deserializer: (value: { '#buffer': string } | typeof Buffer) => {
				if (value instanceof Buffer) return value
				return Buffer.from(value['#buffer'], 'base64')
			},
		},
	})
	deserializionClassByMagicPropertyName.set('#buffer', Buffer)
}
if (Temporal) {
	// Temporal types are only available in environments that support Temporal
	classDataByCtor.set(Temporal.Instant, {
		options: {
			serializer: (value: any) => ({
				'#instant': value.toString(),
			}),
			deserializer: (value: { '#instant': string } | any) => {
				if (value instanceof Temporal.Instant) return value
				return Temporal.Instant.from(
					(value as { '#instant': string })['#instant'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainDate, {
		options: {
			serializer: (value: any) => ({
				'#plainDate': value.toString(),
			}),
			deserializer: (value: { '#plainDate': string } | any) => {
				if (value instanceof Temporal.PlainDate) return value
				return Temporal.PlainDate.from(
					(value as { '#plainDate': string })['#plainDate'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainTime, {
		options: {
			serializer: (value: any) => ({
				'#plainTime': value.toString(),
			}),
			deserializer: (value: { '#plainTime': string } | any) => {
				if (value instanceof Temporal.PlainTime) return value
				return Temporal.PlainTime.from(
					(value as { '#plainTime': string })['#plainTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainDateTime, {
		options: {
			serializer: (value: any) => ({
				'#plainDateTime': value.toString(),
			}),
			deserializer: (value: { '#plainDateTime': string } | any) => {
				if (value instanceof Temporal.PlainDateTime) return value
				return Temporal.PlainDateTime.from(
					(value as { '#plainDateTime': string })['#plainDateTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainYearMonth, {
		options: {
			serializer: (value: any) => ({
				'#plainYearMonth': value.toString(),
			}),
			deserializer: (value: { '#plainYearMonth': string } | any) => {
				if (value instanceof Temporal.PlainYearMonth) return value
				return Temporal.PlainYearMonth.from(
					(value as { '#plainYearMonth': string })['#plainYearMonth'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.PlainMonthDay, {
		options: {
			serializer: (value: any) => ({
				'#plainMonthDay': value.toString(),
			}),
			deserializer: (value: { '#plainMonthDay': string } | any) => {
				if (value instanceof Temporal.PlainMonthDay) return value
				return Temporal.PlainMonthDay.from(
					(value as { '#plainMonthDay': string })['#plainMonthDay'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.ZonedDateTime, {
		options: {
			serializer: (value: any) => ({
				'#zonedDateTime': value.toString(),
			}),
			deserializer: (value: { '#zonedDateTime': string } | any) => {
				if (value instanceof Temporal.ZonedDateTime) return value
				return Temporal.ZonedDateTime.from(
					(value as { '#zonedDateTime': string })['#zonedDateTime'],
				)
			},
		},
	})
	classDataByCtor.set(Temporal.Duration, {
		options: {
			serializer: (value: any) => ({
				'#duration': value.toString(),
			}),
			deserializer: (value: { '#duration': string } | any) => {
				if (value instanceof Temporal.Duration) return value
				return Temporal.Duration.from(
					(value as { '#duration': string })['#duration'],
				)
			},
		},
	})
	deserializionClassByMagicPropertyName.set('#instant', Temporal.Instant)
	deserializionClassByMagicPropertyName.set('#plainDate', Temporal.PlainDate)
	deserializionClassByMagicPropertyName.set('#plainTime', Temporal.PlainTime)
	deserializionClassByMagicPropertyName.set(
		'#plainDateTime',
		Temporal.PlainDateTime,
	)
	deserializionClassByMagicPropertyName.set(
		'#plainYearMonth',
		Temporal.PlainYearMonth,
	)
	deserializionClassByMagicPropertyName.set(
		'#plainMonthDay',
		Temporal.PlainMonthDay,
	)
	deserializionClassByMagicPropertyName.set(
		'#zonedDateTime',
		Temporal.ZonedDateTime,
	)
	deserializionClassByMagicPropertyName.set('#duration', Temporal.Duration)
}

/**
 * Symbol that allows access to the global class registry (on `globalThis`) and class-specific metadata (on the class function).
 */
export const ClassDataSymbol = Symbol.for('JsonClassData')
export const classDataByName =
	(globalThis as any)[ClassDataSymbol] ?? new Map<string, JsonClassData>() // ensure only one instance of the map exists even if JsonClassSerializer is imported multiple times in separate chunks
;(globalThis as any)[ClassDataSymbol] = classDataByName

/**
 * Decorator to globally register a class for serialization/deserialization.
 * @param name The name of the class. If not provided, the class name will be used (explicitly provide a name if you use mangling during code minimization).
 * @param options Options for the class.
 */
export function jsonClass(
	name?: MaybeThunk<string | null>,
	options: JsonClassOptions = {},
): ClassDecorator {
	return (ctor: any) => {
		const data = ensureJsonClassData(ctor)
		data.name =
			name !== null
				? resolveThunk(name) ||
					JsonClassSerializer.defaultOptions.classNameResolver(ctor)
				: undefined
		data.ctor = ctor
		data.options = options
		ctor.prototype[ClassDataSymbol] = data
		if (data.name) {
			classDataByName.set(data.name, data)
		}

		ctor.prototype.toJSON = function () {
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
export function jsonProperty(
	ctorOrThunk?: CtorOrThunk,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return function (target: any, propertyKey: string | symbol) {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'class',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

export function jsonLiteralProperty(
	value: string | number | boolean,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'enum',
			values: [value],
			options,
		})
	}
}

export function jsonEnumProperty(
	values: (string | number | boolean)[],
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'enum',
			values,
			options,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as an array.
 * @param ctorOrThunk The constructor of the array item type, or an arrow function that returns the constructor of the array item type. Must always be set; if item typ is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonArrayProperty(
	ctorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'array',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as a map.
 * @param keyCtorOrThunk The constructor of the map key type, or an arrow function that returns the constructor of the map key type. Must always be set; if key type is string/number/boolean, provide String/Number/Boolean.
 * @param valueCtorOrThunk The constructor of the map value type, or an arrow function that returns the constructor of the map value type. Must always be set; if value type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonMapProperty(
	keyCtorOrThunk: CtorOrThunk | typeof AnyType,
	valueCtorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'map',
			options,
			keyCtorOrThunk,
			valueCtorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as a set.
 * @param ctorOrThunk The constructor of the set item type, or an arrow function that returns the constructor of the set item type. Must always be set; if item type is string/number/boolean, provide String/Number/Boolean.
 * @param options Options for the property.
 */
export function jsonSetProperty(
	ctorOrThunk: CtorOrThunk | typeof AnyType,
	options: JsonPropertyOptions = {},
): PropertyDecorator {
	return (target, propertyKey) => {
		setPropertyInternal(target.constructor, propertyKey, {
			type: 'set',
			options,
			valueCtorOrThunk: ctorOrThunk,
		})
	}
}

/**
 * Decorator to register a property for serialization/deserialization as any type (same as `@jsonProperty(AnyType)`).
 * @param options Options for the property.
 */
export function jsonAnyProperty(
	options: JsonPropertyOptions = {},
): PropertyDecorator {
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

function setPropertyInternal(
	ctor: object,
	propertyKey: PropertyKey,
	propertyData: JsonProperty,
) {
	const data = ensureJsonClassData(ctor)
	if (!data.properties) data.properties = new Map()
	data.properties.set(propertyKey, propertyData)
}
