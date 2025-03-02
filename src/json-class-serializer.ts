import type { Ctor, CtorOrThunk, Deserialized, EffectiveJsonClassSerializerOptions, EntryOrKeyValue, JsonClassData, JsonClassSerializerOptions, JsonProperty } from "./types.ts";
import { resolveThunk } from "./types.ts";
import { classDataByCtor, classDataByName, ClassDataSymbol } from "./metadata.ts";

/**
 * JsonClassSeriallzer serves to serialize and deserialize class instances to and from JSON / plain objects.
 */
export class JsonClassSerializer {
	private static _defaultInstance: JsonClassSerializer | undefined
	/** 
	 * A singleton instance of JsonClassSerializer with default options.
	 */
	public static get defaultInstance(): JsonClassSerializer {
		if(!this._defaultInstance) this._defaultInstance = new JsonClassSerializer
		return this._defaultInstance
	}
	/**
	 * Default options used by any newly created instance of JsonClassSerializer.
	 */
	public static defaultOptions: EffectiveJsonClassSerializerOptions = {
		classNameResolver: ctor => ctor.name,
		serializationPropertyName: '#type',
		serializationClassResolver: undefined,
		deserializationClassResolver: (obj, options) => obj[options.serializationPropertyName],
		useGlobalClassRegistry: true,
		additionalClassesToConsider: {},
		mapSerializationStrategy: 'arrayOfEntries',
		prettyPrint: false,
	}

	/** 
	 * Options used by this instance of JsonClassSerializer. These can also be changed after the instance is created.
	 */
	public options: EffectiveJsonClassSerializerOptions

	/**
	 * Creates a new instance of JsonClassSerializer with the given options.
	 * @param options Options to use for this instance, which will be merged with the default options.
	 */
	constructor(options?: Partial<JsonClassSerializerOptions>) {
		this.options = { ...JsonClassSerializer.defaultOptions, ...options }
	}
	
	// public interface

	/**
	 * Deserializes a JSON string into a class instance.
	 * @param json The JSON string to deserialize.
	 * @param ctor The constructor of the class to deserialize into. If not provided, the class will be determined from the contents of the JSON string, according to the rules specified in {@link JsonClassSerializer.options | options}.
	 * @returns The deserialized class instance.
	 */
	deserializeFromJson<T extends Ctor>(json: string, ctor?: T): InstanceType<T> {
		const obj = JSON.parse(json)
		return this.deserializeFromObjectInternal(obj, this.getClassDataByCtor(ctor))
	}
	
	/**
	 * Deserializes a plain object into a class instance.
	 * @param value The JSON object to deserialize.
	 * @param ctor The constructor of the class to deserialize into. If not provided, the class will be determined from the contents of the plain object, according to the rules specified in {@link JsonClassSerializer.options | options}.
	 * @returns The deserialized class instance.
	 */
	deserializeFromObject<Input extends any, T extends Ctor>(value: Input, ctor?: T): Deserialized<Input, T> {
		return this.deserializeFromObjectInternal(value, this.getClassDataByCtor(ctor))
	}

	/**
	 * Serializes a class instance into a JSON string.
	 * @param value The class instance to serialize.
	 * @returns The serialized JSON string.
	 */
	serializeToJson(value: any): string {
		const obj = this.serializeToObjectInternal(value, true);
		const space = typeof this.options.prettyPrint == 'boolean'
			? (this.options.prettyPrint ? '\t' : undefined)
			: this.options.prettyPrint
		return JSON.stringify(obj, undefined, space)
	}
	
	/**
	 * Serializes a class instance into a plain object.
	 * @param value The class instance to serialize.
	 * @returns The serialized plain object.
	 */
	serializeToObject<T=unknown>(value: any): T {
		return this.serializeToObjectInternal(value, true) as T
	}
	
	// private serialization code

	private serializeToObjectInternal(value: any, needsTypeProperty: boolean): any {
		if(value == null) return value
		const type = typeof value
		if(type == 'string' || type === 'number' || type === 'boolean') return value
		if(Array.isArray(value)) return this.serializeArray(value, needsTypeProperty)
		if(value instanceof Set) return this.serializeSet(value, needsTypeProperty)
		if(value instanceof Map) return this.serializeMap(value, needsTypeProperty)
		if(value instanceof Date) return value.toISOString()
		if(type === 'object') return this.serializeObject(value, needsTypeProperty)
		if(type == 'bigint') return value.toString()
		return value
	}
	
	private serializeArray(value: any[], needsTypeProperty: boolean): any {
		return value.map(item => this.serializeToObjectInternal(item, needsTypeProperty))
	}
	
	private serializeObject(value: any, needsTypeProperty: boolean): any {
		const ctor = value.constructor
		let jsonData = this.getClassDataByCtor(ctor) ?? value[ClassDataSymbol]
		if(!jsonData) {
			const resolvedType = this.options.serializationClassResolver?.(value, this.options) || this.options.classNameResolver?.(ctor)
			if(typeof resolvedType == 'string') {
				jsonData = this.getClassDataByName(resolvedType)
			} else if(resolvedType) {
				jsonData = this.getClassDataByCtor(resolvedType)
			}
		}
		
		if(jsonData) {
			if(jsonData.options?.serializer) {
				value = jsonData.options.serializer(value)
				return this.serializeToObjectInternal(value, needsTypeProperty)
			}

			const obj: any = {}
			if(needsTypeProperty) obj[this.options.serializationPropertyName] = jsonData.name
			for(const [key, propData] of this.getAllProperties(jsonData)) {
				// TODO: implement type checks for properties
				let propValue = value[key]
				if(propData.options.serializer) {
					propValue = propData.options.serializer(propValue)
				}
				obj[key] = this.serializeToObjectInternal(propValue, false)
			}
			return obj
		} else {
			const obj: any = {}
			for(const key in value) {
				obj[key] = this.serializeToObjectInternal(value[key], true)
			}
			return obj
		}
	
	}
	
	private serializeSet(value: Set<any>, needsTypeProperty: boolean): any {
		return Array.from(value).map(item => this.serializeToObjectInternal(item, needsTypeProperty))
	}
	
	private serializeMap(value: Map<any, any>, needsTypeProperty: boolean): any {
		const entries: EntryOrKeyValue[] = Array.from(value.entries())
			.map(([key, value]) => {
				const serializedKey = this.serializeToObjectInternal(key, needsTypeProperty)
				const serializedValue = this.serializeToObjectInternal(value, needsTypeProperty)

				switch(this.options.mapSerializationStrategy) {
					case 'arrayOfEntries': return [serializedKey, serializedValue]
					case 'arrayOfKeyValueObjects': return { key: serializedKey, value: serializedValue }
					default: throw new Error(`Unknown map serialization strategy: ${this.options.mapSerializationStrategy}`)
				}
		})
		return entries
	}
	
	// private deserialization code

	private deserializeFromObjectInternal(value: any, valueClassData: JsonClassData | undefined): any {
		if(valueClassData?.options?.deserializer) {
			value = valueClassData.options.deserializer(value)
		}
		if(value == null) return value

		const type = typeof value
		if(!valueClassData && (type == 'string' || type === 'number' || type === 'boolean')) return value
		
		if(Array.isArray(value)) return this.deserializeArray(value, valueClassData)

		if(valueClassData || type === 'object') return this.deserializeObject(value, valueClassData)
		return value
	}
	
	private getClassDataByName(name: string): JsonClassData | undefined {
		if(!name) return undefined // can happen for anonymous classes not registered with @jsonClass

		if(name in this.options.additionalClassesToConsider) {
			const ctor = this.options.additionalClassesToConsider[name]
			return this.getClassDataByCtor(ctor)
		}
		if(this.options.useGlobalClassRegistry) {
			return classDataByName.get(name)
		}
	}
	
	private getClassDataByCtor(ctorOrThunk: CtorOrThunk | undefined): JsonClassData | undefined {
		if(!ctorOrThunk) return undefined
		const ctor = resolveThunk(ctorOrThunk)
		const classData = classDataByCtor.get(ctor)
		if(classData && !classData.ctor && !classData.options?.deserializer) {
			// could be the case for additional classes known to JsonClassSerializer instance, but not globally registered using @jsonClass
			// don't set ctor if deserializer is set, otherwise it would interfere with deserialization of primitive types
			classData.ctor = ctor
		}
		return classData
	}

	private getAllProperties(jsonData: JsonClassData | undefined): Map<PropertyKey, JsonProperty> {
		const properties = new Map<PropertyKey, JsonProperty>()

		function addPropertiesForClass(jsonData: JsonClassData | undefined) {
			const superClassJsonData = jsonData?.ctor ? classDataByCtor.get(Object.getPrototypeOf(jsonData.ctor)) : undefined
			if(superClassJsonData) {
				// first process super classes to ensure correct order or properties
				addPropertiesForClass(superClassJsonData)
			}
			for(const property of jsonData?.properties?.entries() ?? []) {
				if(!properties.has(property[0])) {
					properties.set(property[0], property[1])
				}
			}
		}
		addPropertiesForClass(jsonData)

		return properties
	}

	private deserializeObject(value: any, valueClassData: JsonClassData | undefined): any {
		if(!valueClassData) {
			const resolvedType = this.options.deserializationClassResolver?.(value, this.options)
			if(typeof resolvedType == 'string') {
				valueClassData = this.getClassDataByName(resolvedType)
			} else if(resolvedType) {
				valueClassData = this.getClassDataByCtor(resolvedType)
			}
		}

		if(valueClassData) {
			let obj: any
			if(typeof value == 'object' && value.constructor !== Object) {
				// already a class instance that doesn't need further construction; nothing left to do
				obj = value
			} else {
				if(valueClassData.ctor) {
					try {
						obj = new valueClassData.ctor()
					} catch {
						obj = Object.create(valueClassData.ctor.prototype)
					}
				} else {
					obj = value
				}
				if(obj && typeof obj == 'object') {
					for(const [key, propData] of this.getAllProperties(valueClassData)) {
						if(!(key in value)) continue
						let propValue = value[key]
						if(propData.options?.deserializer) {
							propValue = propData.options.deserializer(propValue)
						}
						let newValue = propValue
						if(newValue != null) {
							switch(propData.type) {
								case 'class': {
									const valueClassData = this.getClassDataByCtor(propData.valueCtorOrThunk)
									newValue = this.deserializeFromObjectInternal(propValue, valueClassData)
									break
								}
								case 'array': {
									const valueClassData = this.getClassDataByCtor(propData.valueCtorOrThunk)
									newValue = this.deserializeArray(propValue, valueClassData)
									break
								}
								case 'set': {
									const valueClassData = this.getClassDataByCtor(propData.valueCtorOrThunk)
									newValue = this.deserializeSet(propValue, valueClassData)
									break
								}
								case 'map': {
									const keyClassData = this.getClassDataByCtor(propData.keyCtorOrThunk)
									const valueClassData = this.getClassDataByCtor(propData.valueCtorOrThunk)
									newValue = this.deserializeMap(propValue, keyClassData, valueClassData)
									break
								}
								case 'any': {
									newValue = propValue
									break
								}
							}
						}
						Reflect.set(obj, key, newValue)
					}
				}
			}
			return obj
		} else {
			const obj: any = {}
			for(const key in value) {
				obj[key] = this.deserializeFromObjectInternal(value[key], undefined)
			}
			return obj
		}
	}

	private deserializeArray(value: any[], valueClassData: JsonClassData | undefined): any {
		return value.map(item => this.deserializeFromObjectInternal(item, valueClassData))
	}
	
	private deserializeSet(value: any[], valueClassData: JsonClassData | undefined): any {
		return new Set(this.deserializeArray(value, valueClassData))
	}
	
	private deserializeMap(value: ([any, any] | { key: any, value: any })[], keyClassData: JsonClassData | undefined, valueClassData: JsonClassData | undefined): any {
		const entries: ([any, any])[] = value
			.map(entry => {
				if(!Array.isArray(entry)) {
					entry = [entry.key, entry.value]
				}
				const [key, value] = entry
				return [this.deserializeFromObjectInternal(key, keyClassData), this.deserializeFromObjectInternal(value, valueClassData)]
			})
		return new Map(entries)
	}
}