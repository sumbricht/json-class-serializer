import { Ctor, CtorOrThunk, EffectiveJsonClassSerializerOptions, EntryOrKeyValue, JsonClassData, JsonClassSerializerOptions, JsonProperty, resolveThunk } from "./types.ts";
import { classDataByCtor, classDataByName, ClassDataSymbol } from "./metadata.ts";

export class JsonClassSerializer {
	private static _defaultInstance: JsonClassSerializer | undefined
	public static get defaultInstance(): JsonClassSerializer {
		if(!this._defaultInstance) this._defaultInstance = new JsonClassSerializer
		return this._defaultInstance
	}
	public static defaultOptions: EffectiveJsonClassSerializerOptions = {
		classNameResolver: ctor => ctor.name,
		serializationNameResolver: obj => obj['__type'],
		deserializationNameResolver: obj => obj['#type'] || obj['__type'],
		mapSerializationStrategy: 'arrayOfEntries',
		prettyPrint: false,
	}

	protected options: EffectiveJsonClassSerializerOptions

	constructor(options?: Partial<JsonClassSerializerOptions>) {
		this.options = { ...JsonClassSerializer.defaultOptions, ...options }
	}
	
	// public interface

	deserialize<T extends Ctor>(json: string, ctor?: T): InstanceType<T> {
		const obj = JSON.parse(json)
		return this.deserializeFromObjectInternal(obj, this.getClassData(ctor))
	}
	
	deserializeFromObject<T extends Ctor>(value: any, ctor?: T): InstanceType<T> {
		return this.deserializeFromObjectInternal(value, this.getClassData(ctor))
	}

	// protected serialization code

	serialize(value: any): string {
		const obj = this.serializeToObjectInternal(value, true);
		const space = typeof this.options.prettyPrint == 'boolean'
			? (this.options.prettyPrint ? '\t' : undefined)
			: this.options.prettyPrint
		return JSON.stringify(obj, undefined, space)
	}
	
	serializeToObject<T=unknown>(value: any): T {
		return this.serializeToObjectInternal(value, true) as T
	}
	
	protected serializeToObjectInternal(value: any, needsTypeProperty: boolean): any {
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
	
	protected serializeArray(value: any[], needsTypeProperty: boolean): any {
		return value.map(item => this.serializeToObjectInternal(item, needsTypeProperty))
	}
	
	protected serializeObject(value: any, needsTypeProperty: boolean): any {
		const ctor = value.constructor
		let jsonData = this.getClassData(ctor) ?? value[ClassDataSymbol]
		if(!jsonData) {
			const typeName = this.options.serializationNameResolver(value) || this.options.classNameResolver(ctor)
			if(typeName) {
				jsonData = classDataByName.get(typeName)
			}
		}
		
		if(jsonData) {
			if(jsonData.options?.serializer) {
				value = jsonData.options.serializer(value)
				return this.serializeToObjectInternal(value, needsTypeProperty)
			}

			const obj: any = {}
			if(needsTypeProperty) obj['#type'] = jsonData.name
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
	
	protected serializeSet(value: Set<any>, needsTypeProperty: boolean): any {
		return Array.from(value).map(item => this.serializeToObjectInternal(item, needsTypeProperty))
	}
	
	protected serializeMap(value: Map<any, any>, needsTypeProperty: boolean): any {
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
	
	// protected deserialization code

	protected deserializeFromObjectInternal(value: any, valueClassData: JsonClassData | undefined): any {
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
	
	protected getClassData(ctorOrThunk: CtorOrThunk | undefined): JsonClassData | undefined {
		if(!ctorOrThunk) return undefined
		const ctor = resolveThunk(ctorOrThunk)
		return classDataByCtor.get(ctor)
	}

	protected getAllProperties(jsonData: JsonClassData | undefined): Map<PropertyKey, JsonProperty> {
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

	protected deserializeObject(value: any, valueClassData: JsonClassData | undefined): any {
		if(!valueClassData) {
			const typeName = this.options.deserializationNameResolver(value)
			if(typeName) {
				valueClassData = classDataByName.get(typeName)
			}
		}

		if(valueClassData) {
			let obj: any
			if(typeof value == 'object' && value.constructor !== Object) {
				// already a class instance that doesn't need further construction; nothing left to do
				obj = value
			} else {
				if(valueClassData.factoryFn) {
					obj = valueClassData.factoryFn(value)
				} else {
					try {
						obj = new valueClassData.ctor!()
					} catch {
						obj = Object.create(valueClassData.ctor.prototype)
					}
				}
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
								const valueClassData = this.getClassData(propData.valueCtorOrThunk)
								newValue = this.deserializeFromObjectInternal(propValue, valueClassData)
								break
							}
							case 'array': {
								const valueClassData = this.getClassData(propData.valueCtorOrThunk)
								newValue = this.deserializeArray(propValue, valueClassData)
								break
							}
							case 'set': {
								const valueClassData = this.getClassData(propData.valueCtorOrThunk)
								newValue = this.deserializeSet(propValue, valueClassData)
								break
							}
							case 'map': {
								const keyClassData = this.getClassData(propData.keyCtorOrThunk)
								const valueClassData = this.getClassData(propData.valueCtorOrThunk)
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
			return obj
		} else {
			const obj: any = {}
			for(const key in value) {
				obj[key] = this.deserializeFromObjectInternal(value[key], undefined)
			}
			return obj
		}
	}

	protected deserializeArray(value: any[], valueClassData: JsonClassData | undefined): any {
		return value.map(item => this.deserializeFromObjectInternal(item, valueClassData))
	}
	
	protected deserializeSet(value: any[], valueClassData: JsonClassData | undefined): any {
		return new Set(this.deserializeArray(value, valueClassData))
	}
	
	protected deserializeMap(value: ([any, any] | { key: any, value: any })[], keyClassData: JsonClassData | undefined, valueClassData: JsonClassData | undefined): any {
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