import { classDataByCtor } from './metadata.ts'
import { PropertyOrMapKey } from './types.ts'

/**
 * Gets the name of a class as registered with the `@jsonClass` decorator.
 * @param ctorOrInstance The constructor or instance of the class.
 */
export function getJsonClassName(ctorOrInstance: any): string {
	const ctor =
		typeof ctorOrInstance === 'function'
			? ctorOrInstance
			: ctorOrInstance.constructor
	return classDataByCtor.get(ctor)?.name || ctor.name
}

export function getInObjectFromPath(obj: any, path: PropertyOrMapKey[]) {
	let current = obj
	const processedKeys: PropertyOrMapKey[] = []
	for (const key of path) {
		processedKeys.push(key)
		if (Array.isArray(key)) {
			if (!(current instanceof Map)) {
				throw new Error(
					`Failed to deserialize reference from path ${JSON.stringify(path)} at position ${JSON.stringify(processedKeys)}: expected Map, got ${current}`,
				)
			}
			current = [...current.entries()][key[0]][key[1]]
		} else if (current instanceof Set) {
			current = [...current][key as number]
		} else {
			current = current[key]
		}
		if (!current) {
			throw new Error(
				`Failed to deserialize reference from path ${JSON.stringify(path)} at position ${JSON.stringify(processedKeys)}`,
			)
		}
	}
	return current
}

export function setInObjectFromPath(
	obj: any,
	path: PropertyOrMapKey[],
	value: any,
) {
	const parent = getInObjectFromPath(obj, path.slice(0, -1))
	const property = path.at(-1)!
	if (Array.isArray(property)) {
		if (!(parent instanceof Map))
			throw new Error(
				`Failed to set reference at path ${JSON.stringify(path)}: expected Map, got ${parent}`,
			)
		const [idx, keyOrValueIdx] = property as [number, number]
		const entries = [...parent.entries()]
		if (keyOrValueIdx == 1) {
			// set value; that's the easy case
			parent.set(entries[idx][0], value)
		} else {
			// reconstruct new map with new key
			entries[idx][0] = value
			const newMap = new Map(entries)
			setInObjectFromPath(obj, path.slice(0, -1), newMap)
		}
	} else {
		if (parent instanceof Set) {
			const members = [...parent]
			members[property as number] = value
			setInObjectFromPath(obj, path.slice(0, -1), new Set(members))
		} else {
			Reflect.set(parent, property, value)
		}
	}
}

// conversion of buffers to base64
// TODO: replace with native implementation when TC39 proposal https://github.com/tc39/proposal-arraybuffer-base64 is widely available
export function dataViewToBase64(view: DataView): string {
	return arrayBufferToBase64(view.buffer)
}

export function arrayBufferToBase64(buffer: ArrayBufferLike): string {
	return uint8ArrayToBase64(new Uint8Array(buffer))
}

export function uint8ArrayToBase64(array: Uint8Array): string {
	const uint16Array = Uint16Array.from(array)
	const binaryStr = new TextDecoder('utf-16').decode(uint16Array)
	const base64 = btoa(binaryStr)
	return base64
}

// conversion of base64 to buffers
export function base64ToDataView(base64: string | DataView): DataView {
	if (base64 instanceof DataView) return base64
	return new DataView(base64ToArrayBuffer(base64))
}

export function base64ToArrayBuffer(base64: string | ArrayBuffer): ArrayBuffer {
	if (base64 instanceof ArrayBuffer) return base64
	return base64ToUint8Array(base64).buffer as ArrayBuffer
}

export function base64ToUint8Array(base64: string | Uint8Array): Uint8Array {
	if (base64 instanceof Uint8Array) return base64
	const binaryStr = atob(base64)
	const array = Uint8Array.from(binaryStr, (char) => char.charCodeAt(0))
	return array
}
