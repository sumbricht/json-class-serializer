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
/**
 * Symbol that allows access to the global class registry (on `globalThis`) and class-specific metadata (on the class function).
 */
export const metadataName = 'JsonClassData'
export const ClassDataSymbol = Symbol.metadata ?? Symbol.for(metadataName)
export const classDataByName = (globalThis as any)[ClassDataSymbol] ?? new Map<string, JsonClassData>() // ensure only one instance of the map exists even if JsonClassSerializer is imported multiple times in separate chunks
;(globalThis as any)[ClassDataSymbol] = classDataByName

/**
 * Decorator to globally register a class for serialization/deserialization.
 * @param name The name of the class. If not provided, the class name will be used (explicitly provide a name if you use mangling during code minimization).
 * @param options Options for the class.
 */
export function jsonClass(name?: MaybeThunk<string | null>, options: JsonClassOptions = {}): ClassDecorator {
	return (ctor: any, context?: DecoratorContext) => {
		const data = ensureJsonClassData(ctor, context)

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
	}
}

/**
 * Decorator to register a property for serialization/deserialization. Properties not decorated with this decorator will be ignored when serializing/deserializing.
 * @param ctorOrThunk The constructor of the property type, or an arrow function that returns the constructor of the property type. Must be provided unless the property type is string/number/boolean.
 * @param options Options for the property.
 */
export function jsonProperty(ctorOrThunk?: CtorOrThunk, options: JsonPropertyOptions = {}): any {
	return (targetOrUndefined: any, propertyKeyOrContext: string | symbol | DecoratorContext) => {
		setPropertyInternal(targetOrUndefined?.constructor, propertyKeyOrContext, {
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
export function jsonArrayProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): any {
	return (targetOrUndefined: any, propertyKeyOrContext: string | symbol | DecoratorContext) => {
		setPropertyInternal(targetOrUndefined?.constructor, propertyKeyOrContext, {
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
export function jsonMapProperty(keyCtorOrThunk: CtorOrThunk | typeof AnyType, valueCtorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): any {
	return (targetOrUndefined: any, propertyKeyOrContext: string | symbol | DecoratorContext) => {
		setPropertyInternal(targetOrUndefined?.constructor, propertyKeyOrContext, {
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
export function jsonSetProperty(ctorOrThunk: CtorOrThunk | typeof AnyType, options: JsonPropertyOptions = {}): any {
	return (targetOrUndefined: any, propertyKeyOrContext: string | symbol | DecoratorContext) => {
		setPropertyInternal(targetOrUndefined?.constructor, propertyKeyOrContext, {
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
export function jsonAnyProperty(options: JsonPropertyOptions = {}): any {
	return (targetOrUndefined: any, propertyKeyOrContext: string | symbol | DecoratorContext) => {
		setPropertyInternal(targetOrUndefined?.constructor, propertyKeyOrContext, {
			type: 'any',
			options,
		})
	}
}

function ensureJsonClassData(ctor: any, decoratorContext: DecoratorContext | undefined): JsonClassData {
	let data: JsonClassData | undefined
	if(decoratorContext) {
		data = Object.hasOwn(decoratorContext?.metadata, metadataName) ? decoratorContext.metadata[metadataName] as JsonClassData: undefined
	 }
	if(!data && ctor) {
		data = classDataByCtor.get(ctor)
	}
	if (!data) {
		if(decoratorContext) {
			// new decorator format
			if(!Object.hasOwn(decoratorContext.metadata, metadataName)) decoratorContext.metadata[metadataName] = {}
			data = decoratorContext.metadata[metadataName]!
		} else {
			// legacy decorator format
			ctor.prototype[ClassDataSymbol] = ctor.prototype[ClassDataSymbol] ?? {}
			ctor.prototype[ClassDataSymbol][metadataName] = ctor.prototype[ClassDataSymbol][metadataName] ?? {}
			data = ctor.prototype[ClassDataSymbol][metadataName]
		}
		if(ctor) {
			classDataByCtor.set(ctor, data!)
		}
	}
	return data!
}

function setPropertyInternal(ctor: any, propertyKeyOrContext: PropertyKey | DecoratorContext, propertyData: JsonProperty) {
	if(typeof propertyKeyOrContext === 'object') {
		// new decorator format
		const data = ensureJsonClassData(ctor, propertyKeyOrContext)
		if (!data.properties) data.properties = new Map()
		data.properties.set(propertyKeyOrContext.name!, propertyData)
	} else {
		const data = ensureJsonClassData(ctor, undefined)
		if (!data.properties) data.properties = new Map()
		data.properties.set(propertyKeyOrContext, propertyData)
	}
}