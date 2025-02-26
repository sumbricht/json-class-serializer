import { Ctor, CtorOrThunk, JsonClassData, resolveThunk } from "./types.ts";
import { classDataByCtor, classDataByName } from "./metadata.ts";

export class JsonClassSerializer {
	constructor(protected nameResolver: (obj: any) => string = obj => obj['#type']) {}
	
	// public interface

	deserialize(json: string, ctor?: Ctor): any {
		const obj = JSON.parse(json)
		return this.deserializeFromObjectInternal(obj, this.getClassData(ctor))
	}
	
	deserializeFromObject<T=unknown>(value: any, ctor?: Ctor): T {
		return this.deserializeFromObjectInternal(value, this.getClassData(ctor)) as T
	}

	// protected serialization code

	serialize(value: any): string {
		const obj = this.serializeToObjectInternal(value, true);
		return JSON.stringify(obj)
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
		const jsonData = classDataByCtor.get(ctor)
		if(jsonData) {
			const obj: any = {}
			if(needsTypeProperty) obj['#type'] = jsonData.name
			for(const [key, _propData] of jsonData.properties ?? []) {
				// TODO: implement type checks for properties
				const propValue = value[key]
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
		const entries: [any, any][] = Array.from(value.entries())
			.map(([key, value]) => [this.serializeToObjectInternal(key, needsTypeProperty), this.serializeToObjectInternal(value, needsTypeProperty)] as const)
		return entries
	}
	
	// protected deserialization code

	protected deserializeFromObjectInternal(value: any, valueClassData: JsonClassData | undefined): any {
		if(value == null) return value

		const type = typeof value
		if(!valueClassData && (type == 'string' || type === 'number' || type === 'boolean')) return value
		
		if(valueClassData || type === 'object') return this.deserializeObject(value, valueClassData)
		return value
	}
	
	protected getClassData(ctorOrThunk: CtorOrThunk | undefined): JsonClassData | undefined {
		if(!ctorOrThunk) return undefined
		const ctor = resolveThunk(ctorOrThunk)
		return classDataByCtor.get(ctor)
	}

	protected deserializeObject(value: any, valueClassData: JsonClassData | undefined): any {
		if(!valueClassData) {
			const typeName = this.nameResolver(value)
			if(typeName) {
				valueClassData = classDataByName.get(typeName)
			}
		}

		if(valueClassData) {
			let obj: any
			if(valueClassData.factoryFn) {
				obj = valueClassData.factoryFn(value)
			} else {
				try {
					obj = new valueClassData.ctor!()
				} catch {
					obj = Object.create(valueClassData.ctor.prototype)
				}
			}
			for(const [key, propData] of valueClassData.properties ?? []) {
				const propValue = value[key]
				let newValue: any
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
				Reflect.set(obj, key, newValue)
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
	
	protected deserializeMap(value: [any, any][], keyClassData: JsonClassData | undefined, valueClassData: JsonClassData | undefined): any {
		const entries: [any, any][] = value
			.map(([key, value]) => [this.deserializeFromObjectInternal(key, keyClassData), this.deserializeFromObjectInternal(value, valueClassData)])
		return new Map(entries)
	}
}
