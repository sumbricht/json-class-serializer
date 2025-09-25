import type {
	Ctor,
	CtorOrThunk,
	Deserialized,
	EffectiveJsonClassSerializerOptions,
	EntryOrKeyValue,
	JsonClassData,
	JsonClassSerializerOptions,
	JsonProperty,
	KeyOrValue,
	PropertyOrMapKey,
} from './types.ts'
import {
	propertyHasKeyCtor,
	propertyHasValueCtor,
	resolveThunk,
} from './types.ts'
import {
	classDataByCtor,
	classDataByName,
	ClassDataSymbol,
} from './metadata.ts'
import {
	getInObjectFromPath,
	setInObjectFromPath,
	DeleteSymbol,
} from './utils.ts'

/**
 * JsonClassSeriallzer serves to serialize and deserialize class instances to and from JSON / plain objects.
 */
export class JsonClassSerializer {
	private static _defaultInstance: JsonClassSerializer | undefined
	/**
	 * A singleton instance of JsonClassSerializer with default options.
	 */
	public static get defaultInstance(): JsonClassSerializer {
		if (!this._defaultInstance)
			this._defaultInstance = new JsonClassSerializer()
		return this._defaultInstance
	}
	/**
	 * Default options used by any newly created instance of JsonClassSerializer.
	 */
	public static defaultOptions: EffectiveJsonClassSerializerOptions = {
		classNameResolver: (ctor) => ctor.name,
		serializationPropertyName: '#type',
		serializationClassResolver: undefined,
		deserializationClassResolver: (obj, options) =>
			obj[options.serializationPropertyName],
		useGlobalClassRegistry: true,
		additionalClassesToConsider: {},
		failIfTypeResolutionFails: true,
		failIfRootClassNotFound: false,
		failIfPlainObjectsFound: false,
		mapSerializationStrategy: 'arrayOfEntries',
		prettyPrint: false,
		circularDependencyReferencePropertyName: null,
		circularDependencyLevelPropertyName: null,
	}

	/**
	 * Options used by this instance of JsonClassSerializer. These can also be changed after the instance is created.
	 */
	public options: EffectiveJsonClassSerializerOptions

	private encounteredObjectPathsInSerialization = new WeakMap<
		object,
		PropertyKey[]
	>()
	private encounteredReferencePathsInDeserialization: PropertyOrMapKey[][] = [] // to replace circular references after deserialization; tuple of two PropertyKeys for map key/value pairs
	private encounteredRootPathsInDeserialization: PropertyOrMapKey[][] = [] // to replace circular references after deserialization; tuple of two PropertyKeys for map key/value pairs
	private encounteredLevelPathsInDeserialization: PropertyOrMapKey[][] = []
	private encounteredInputObjectPathsInDeserialization = new Map<
		any,
		PropertyOrMapKey[]
	>()
	private rootSerializationObjRef: WeakRef<any> | undefined

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
	 * @param failIfRootClassNotFound Whether to fail if the root class is not found during deserialization. Default: What is set in the options of JsonClassSerializer (default: true).
	 * @returns The deserialized class instance.
	 */
	deserializeFromJson<T extends Ctor>(
		json: string,
		ctor?: T,
		failIfRootClassNotFound?: boolean,
	): InstanceType<T> {
		const obj = JSON.parse(json)
		const result = this.deserializeFromObject(
			obj,
			ctor,
			failIfRootClassNotFound,
		) as InstanceType<T>
		if (this.options.circularDependencyLevelPropertyName) {
			delete (result as any)[this.options.circularDependencyLevelPropertyName]
		}

		return result
	}

	/**
	 * Deserializes a plain object into a class instance.
	 * @param value The JSON object to deserialize.
	 * @param ctor The constructor of the class to deserialize into. If not provided, the class will be determined from the contents of the plain object, according to the rules specified in {@link JsonClassSerializer.options | options}.
	 * @param failIfRootClassNotFound Whether to fail if the root class is not found during deserialization. Default: What is set in the options of JsonClassSerializer (default: true).
	 * @returns The deserialized class instance.
	 */
	deserializeFromObject<Input extends any, T extends Ctor>(
		value: Input,
		ctor?: T,
		failIfRootClassNotFound?: boolean,
	): Deserialized<Input, T> {
		this.encounteredReferencePathsInDeserialization = []
		this.encounteredRootPathsInDeserialization = []
		this.encounteredLevelPathsInDeserialization = []
		this.encounteredInputObjectPathsInDeserialization = new Map()
		const result = this.deserializeFromObjectInternal(
			value,
			[],
			this.getClassDataByCtor(ctor),
			failIfRootClassNotFound ?? this.options.failIfRootClassNotFound,
		)
		this.replaceCircularReferences(result)
		return result
	}

	/**
	 * Serializes a class instance into a JSON string.
	 * @param value The class instance to serialize.
	 * @returns The serialized JSON string.
	 */
	serializeToJson(value: any): string {
		const obj = this.serializeToObject(value)
		const space =
			typeof this.options.prettyPrint == 'boolean'
				? this.options.prettyPrint
					? '\t'
					: undefined
				: this.options.prettyPrint
		return JSON.stringify(obj, undefined, space)
	}

	/**
	 * Serializes a class instance into a plain object.
	 * @param value The class instance to serialize.
	 * @returns The serialized plain object.
	 */
	serializeToObject<T = unknown>(value: any): T {
		this.encounteredObjectPathsInSerialization = new WeakMap()
		if (value && typeof value == 'object') {
			this.rootSerializationObjRef = new WeakRef(value)
		}
		const serialized = this.serializeToObjectInternal(
			value,
			[],
			false,
			undefined,
		) as T
		this.rootSerializationObjRef = undefined
		return serialized
	}

	// private serialization code

	private serializeToObjectInternal(
		value: any,
		path: PropertyKey[],
		hasLevelBeenApplied: boolean,
		owningPropertyData: JsonProperty | undefined,
		asKeyOrValue: KeyOrValue = 'value',
	): any {
		if (value == null) return value
		const type = typeof value
		if (type == 'string' || type === 'number' || type === 'boolean')
			return value

		if (this.encounteredObjectPathsInSerialization.has(value)) {
			if (this.options.circularDependencyReferencePropertyName) {
				// object has been encountered before; return reference to its path
				const refPath = this.encounteredObjectPathsInSerialization.get(value)
				return {
					[this.options.circularDependencyReferencePropertyName]: refPath,
				}
			} else {
				// object has been encountered before, but circular reference references are not activated.
				// check parent chain for value to determine if it's a circular reference and throw only in that case
				const rootObj = this.rootSerializationObjRef?.deref()
				if (rootObj) {
					for (let pathLen = 0; pathLen < path.length; pathLen++) {
						const parentPath = path.slice(0, pathLen)
						const parentValue = getInObjectFromPath(rootObj, parentPath)
						if (parentValue === value) {
							throw new Error(
								`Circular reference detected at path ${JSON.stringify(path)}. To enable circular reference replacement, set the 'circularDependencyReferencePropertyName' option.`,
							)
						}
					}
				}
			}
		}

		if (type == 'bigint') return value.toString()

		// typeof value === 'object'
		this.encounteredObjectPathsInSerialization.set(value, path)

		if (Array.isArray(value))
			return this.serializeArray(
				value,
				path,
				hasLevelBeenApplied,
				owningPropertyData,
			)
		if (value instanceof Set)
			return this.serializeSet(
				value,
				path,
				hasLevelBeenApplied,
				owningPropertyData,
			)
		if (value instanceof Map)
			return this.serializeMap(
				value,
				path,
				hasLevelBeenApplied,
				owningPropertyData,
			)
		if (typeof value.toJSON == 'function' && !value.toJSON[ClassDataSymbol]) {
			// check for toJSON[ClassDataSymbol] to avoid infinite recursion
			return this.serializeToObjectInternal(
				value.toJSON(),
				path,
				hasLevelBeenApplied,
				owningPropertyData,
				asKeyOrValue,
			)
		}
		if (type === 'object')
			return this.serializeObject(
				value,
				path,
				hasLevelBeenApplied,
				owningPropertyData,
				asKeyOrValue,
			)
		return value
	}

	private serializeArray(
		value: any[],
		path: PropertyKey[],
		hasLevelBeenApplied: boolean,
		owningPropertyData: JsonProperty | undefined,
	): any {
		return value.map((item, idx) =>
			this.serializeToObjectInternal(
				item,
				path.concat(idx),
				hasLevelBeenApplied,
				owningPropertyData,
			),
		)
	}

	private serializeObject(
		value: any,
		path: PropertyKey[],
		hasLevelBeenApplied: boolean,
		owningPropertyData: JsonProperty | undefined,
		asKeyOrValue: KeyOrValue = 'value',
	): any {
		const ctor = value.constructor
		let jsonData = this.getClassDataByCtor(ctor) ?? value[ClassDataSymbol]
		if (!jsonData) {
			const resolvedType =
				this.options.serializationClassResolver?.(value, this.options) ||
				this.options.classNameResolver?.(ctor)
			if (typeof resolvedType == 'string') {
				jsonData = this.getClassDataByName(resolvedType)
			} else if (resolvedType) {
				jsonData = this.getClassDataByCtor(resolvedType)
			}
		}

		let obj: any = {}
		if (jsonData) {
			if (jsonData.options?.serializer) {
				value = jsonData.options.serializer(value)
				obj = this.serializeToObjectInternal(
					value,
					path,
					hasLevelBeenApplied,
					owningPropertyData,
				)
			} else {
				const needsTypeProperty =
					!owningPropertyData ||
					(asKeyOrValue == 'key' &&
						propertyHasKeyCtor(owningPropertyData) &&
						resolveThunk(owningPropertyData.keyCtorOrThunk) !== ctor) ||
					(asKeyOrValue == 'value' &&
						propertyHasValueCtor(owningPropertyData) &&
						resolveThunk(owningPropertyData.valueCtorOrThunk) !== ctor)
				if (needsTypeProperty)
					obj[this.options.serializationPropertyName] = jsonData.name
				for (const [key, propData] of this.getAllProperties(jsonData)) {
					// TODO: implement type checks for properties
					let propValue = value[key]

					if (
						propValue &&
						typeof propValue == 'object' &&
						propertyHasValueCtor(propData) &&
						!propData.valueCtorOrThunk &&
						!propData.options?.deserializer
					) {
						// if the property value is an object, but the class is not known, throw an error
						throw new Error(
							`Could not find class data for property '${typeof key != 'object' ? String(key) : '[object]'}' while trying to serialize object of type '${jsonData.name}'`,
						)
					}
					if (propData.options.serializer) {
						propValue = propData.options.serializer(propValue)
					}
					obj[key] = this.serializeToObjectInternal(
						propValue,
						path.concat(key),
						true,
						propData,
					)
				}
			}
		} else {
			for (const key in value) {
				obj[key] = this.serializeToObjectInternal(
					value[key],
					path.concat(key),
					true,
					undefined,
				)
			}
		}

		if (
			this.options.circularDependencyLevelPropertyName &&
			!hasLevelBeenApplied
		) {
			obj[this.options.circularDependencyLevelPropertyName] = path.length
		}

		return obj
	}

	private serializeSet(
		value: Set<any>,
		path: PropertyKey[],
		hasLevelBeenApplied: boolean,
		owningPropertyData: JsonProperty | undefined,
	): any {
		return Array.from(value).map((item, idx) =>
			this.serializeToObjectInternal(
				item,
				path.concat(idx),
				hasLevelBeenApplied,
				owningPropertyData,
			),
		)
	}

	private serializeMap(
		value: Map<any, any>,
		path: PropertyKey[],
		hasLevelBeenApplied: boolean,
		owningPropertyData: JsonProperty | undefined,
	): any {
		const entries: EntryOrKeyValue[] = Array.from(value.entries()).map(
			([key, value], idx) => {
				const serializedKey = this.serializeToObjectInternal(
					key,
					path.concat(idx, 0),
					hasLevelBeenApplied,
					owningPropertyData,
					'key',
				)
				const serializedValue = this.serializeToObjectInternal(
					value,
					path.concat(idx, 1),
					hasLevelBeenApplied,
					owningPropertyData,
				)

				switch (this.options.mapSerializationStrategy) {
					case 'arrayOfEntries':
						return [serializedKey, serializedValue] as [any, any]
					case 'arrayOfKeyValueObjects':
						return { key: serializedKey, value: serializedValue }
					default:
						throw new Error(
							`Unknown map serialization strategy: ${this.options.mapSerializationStrategy}`,
						)
				}
			},
		)
		return entries
	}

	// private deserialization code

	private deserializeFromObjectInternal(
		value: any,
		path: PropertyOrMapKey[],
		valueClassData: JsonClassData | undefined,
		failIfClassNotFound: boolean,
	): any {
		if (this.options.circularDependencyReferencePropertyName) {
			if (value?.[this.options.circularDependencyReferencePropertyName]) {
				this.encounteredReferencePathsInDeserialization.push(path)
				return value // will be replaced later when deserialization is almost done
			} else if (this.encounteredInputObjectPathsInDeserialization.has(value)) {
				this.encounteredReferencePathsInDeserialization.push(path)
				const valueEncounteredAtPath =
					this.encounteredInputObjectPathsInDeserialization.get(value)
				return {
					[this.options.circularDependencyReferencePropertyName]:
						valueEncounteredAtPath,
				} // will be replaced later when deserialization is almost done
			}
		}

		if (
			this.options.circularDependencyLevelPropertyName &&
			value?.[this.options.circularDependencyLevelPropertyName] !== undefined
		) {
			const levelsToKeep =
				value?.[this.options.circularDependencyLevelPropertyName]
			const pathToKeep = path.slice(0, path.length - levelsToKeep)
			this.encounteredRootPathsInDeserialization.push(pathToKeep)
			this.encounteredLevelPathsInDeserialization.push(path)
		}

		if (valueClassData?.options?.deserializer) {
			value = valueClassData.options.deserializer(value)
		}
		if (value == null) return value

		const type = typeof value
		if (typeof value === 'object') {
			this.encounteredInputObjectPathsInDeserialization.set(value, path)
		}

		let newValue = value
		if (
			!valueClassData &&
			(type == 'string' || type === 'number' || type === 'boolean')
		) {
			newValue = value
		} else if (Array.isArray(value)) {
			newValue = this.deserializeArray(
				value,
				path,
				valueClassData,
				failIfClassNotFound,
			)
		} else if (valueClassData || type === 'object') {
			newValue = this.deserializeObject(
				value,
				path,
				valueClassData,
				failIfClassNotFound,
			)
		}

		return newValue
	}

	private getClassDataByName(name: string): JsonClassData | undefined {
		if (!name) return undefined // can happen for anonymous classes not registered with @jsonClass

		if (name in this.options.additionalClassesToConsider) {
			const additionalClassesToConsider = resolveThunk(
				this.options.additionalClassesToConsider,
			)
			const ctor = additionalClassesToConsider[name]
			const classData = this.getClassDataByCtor(ctor)
			if (classData) return classData
		}
		if (this.options.useGlobalClassRegistry) {
			return classDataByName.get(name)
		}
	}

	private getClassDataByCtor(
		ctorOrThunk: CtorOrThunk | undefined,
	): JsonClassData | undefined {
		if (!ctorOrThunk) return undefined
		const ctor = resolveThunk(ctorOrThunk)
		const classData = classDataByCtor.get(ctor)
		if (classData && !classData.ctor && !classData.options?.deserializer) {
			// could be the case for additional classes known to JsonClassSerializer instance, but not globally registered using @jsonClass
			// don't set ctor if deserializer is set, otherwise it would interfere with deserialization of primitive types
			classData.ctor = ctor
		}
		return classData
	}

	private getAllProperties(
		jsonData: JsonClassData | undefined,
	): Map<PropertyKey, JsonProperty> {
		const properties = new Map<PropertyKey, JsonProperty>()

		function addPropertiesForClass(
			jsonData: JsonClassData | undefined,
			ctor: Ctor | undefined,
		) {
			const superClass = ctor ? Object.getPrototypeOf(ctor) : undefined
			if (superClass) {
				// first process super classes to ensure correct order or properties. Also dive down prototype chain if no jsonData is available as there could be intermediate classes without any annotated properties
				const superClassJsonData = superClass
					? classDataByCtor.get(superClass)
					: undefined
				addPropertiesForClass(superClassJsonData, superClass)
			}
			for (const property of jsonData?.properties?.entries() ?? []) {
				if (!properties.has(property[0])) {
					properties.set(property[0], property[1])
				}
			}
		}
		addPropertiesForClass(jsonData, jsonData?.ctor)

		return properties
	}

	private deserializeObject(
		value: any,
		path: PropertyOrMapKey[],
		valueClassData: JsonClassData | undefined,
		failIfClassNotFound: boolean,
	): any {
		const needToDetermineClassData =
			!valueClassData || (value && typeof value == 'object')
		if (needToDetermineClassData) {
			const resolvedType = this.options.deserializationClassResolver?.(
				value,
				this.options,
			)
			if (typeof resolvedType == 'string') {
				valueClassData = this.getClassDataByName(resolvedType)
			} else if (resolvedType) {
				valueClassData = this.getClassDataByCtor(resolvedType)
			}
			if (
				resolvedType &&
				!valueClassData &&
				this.options.failIfTypeResolutionFails
			) {
				throw new Error(
					`Could not resolve class data while trying to deserialize object of type '${resolvedType}': ${JSON.stringify(value)}`,
				)
			}
		}

		if (valueClassData) {
			let obj: any
			if (typeof value == 'object' && value.constructor !== Object) {
				// already a class instance that doesn't need further construction; nothing left to do
				obj = value
			} else {
				if (valueClassData.ctor) {
					try {
						obj = new valueClassData.ctor()
					} catch {
						obj = Object.create(valueClassData.ctor.prototype)
					}
				} else {
					obj = value
				}
				if (obj && typeof obj == 'object') {
					for (const [key, propData] of this.getAllProperties(valueClassData)) {
						if (!(key in value)) continue
						let propValue = value[key]
						if (propData.options?.deserializer) {
							propValue = propData.options.deserializer(propValue)
						}
						let newValue = propValue
						if (newValue != null) {
							switch (propData.type) {
								case 'class': {
									const valueClassData = this.getClassDataByCtor(
										propData.valueCtorOrThunk,
									)
									newValue = this.deserializeFromObjectInternal(
										propValue,
										path.concat(key),
										valueClassData,
										false,
									)
									break
								}
								case 'array': {
									const valueClassData = this.getClassDataByCtor(
										propData.valueCtorOrThunk,
									)
									newValue = this.deserializeArray(
										propValue,
										path.concat(key),
										valueClassData,
										false,
									)
									break
								}
								case 'set': {
									const valueClassData = this.getClassDataByCtor(
										propData.valueCtorOrThunk,
									)
									newValue = this.deserializeSet(
										propValue,
										path.concat(key),
										valueClassData,
									)
									break
								}
								case 'map': {
									const keyClassData = this.getClassDataByCtor(
										propData.keyCtorOrThunk,
									)
									const valueClassData = this.getClassDataByCtor(
										propData.valueCtorOrThunk,
									)
									newValue = this.deserializeMap(
										propValue,
										path.concat(key),
										keyClassData,
										valueClassData,
									)
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
			if (failIfClassNotFound || this.options.failIfPlainObjectsFound) {
				throw new Error(
					`Could not find class data while trying to deserialize: ${JSON.stringify(value)}`,
				)
			}
			const obj: any = {}
			for (const key in value) {
				obj[key] = this.deserializeFromObjectInternal(
					value[key],
					path.concat(key),
					undefined,
					false,
				)
			}
			return obj
		}
	}

	private deserializeArray(
		value: any[],
		path: PropertyOrMapKey[],
		valueClassData: JsonClassData | undefined,
		failIfClassNotFound: boolean,
	): any {
		return value.map((item, idx) =>
			this.deserializeFromObjectInternal(
				item,
				path.concat(idx),
				valueClassData,
				failIfClassNotFound,
			),
		)
	}

	private deserializeSet(
		value: any[],
		path: PropertyOrMapKey[],
		valueClassData: JsonClassData | undefined,
	): any {
		return new Set(this.deserializeArray(value, path, valueClassData, false))
	}

	private deserializeMap(
		value: ([any, any] | { key: any; value: any })[],
		path: PropertyOrMapKey[],
		keyClassData: JsonClassData | undefined,
		valueClassData: JsonClassData | undefined,
	): any {
		const entries: [any, any][] = value.map((entry, idx) => {
			if (!Array.isArray(entry)) {
				entry = [entry.key, entry.value]
			}
			const [key, value] = entry
			return [
				this.deserializeFromObjectInternal(
					key,
					[...path, [idx, 0]],
					keyClassData,
					false,
				),
				this.deserializeFromObjectInternal(
					value,
					[...path, [idx, 1]],
					valueClassData,
					false,
				),
			] as const
		})
		return new Map(entries)
	}

	private replaceCircularReferences(obj: any) {
		if (!this.options.circularDependencyReferencePropertyName) return
		const rootJsons = this.encounteredRootPathsInDeserialization.map((path) =>
			JSON.stringify(path),
		)

		for (const refPath of this.encounteredReferencePathsInDeserialization) {
			const refObj = getInObjectFromPath(obj, refPath)
			let targetPath =
				refObj[this.options.circularDependencyReferencePropertyName]
			if (!Array.isArray(targetPath)) {
				// refObj is no longer a marker for circular references; most likely it was replaced another way by the consuming code, therefore ignore
				continue
			}

			for (let i = refPath.length - 1; i > 0; i--) {
				const pathToPotentialRoot = refPath.slice(0, i)
				if (rootJsons.includes(JSON.stringify(pathToPotentialRoot))) {
					targetPath = pathToPotentialRoot.concat(targetPath)
					break
				}
			}

			const targetObj = getInObjectFromPath(obj, targetPath)
			setInObjectFromPath(obj, refPath, targetObj)
		}

		for (const levelPath of this.encounteredLevelPathsInDeserialization) {
			const rootObj = getInObjectFromPath(obj, levelPath)
			setInObjectFromPath(
				rootObj,
				[this.options.circularDependencyLevelPropertyName!],
				DeleteSymbol,
			)
		}
	}
}
