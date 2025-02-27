import { classDataByCtor } from "./metadata.ts";

export function getJsonClassName(ctorOrInstance: any): string {
    const ctor = typeof ctorOrInstance === 'function' ? ctorOrInstance : ctorOrInstance.constructor
    return classDataByCtor.get(ctor)?.name || ctor.name
}

// conversion of buffers to base64
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
export function base64ToDataView(base64: string): DataView {
    return new DataView(base64ToArrayBuffer(base64))
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
    return base64ToUint8Array(base64).buffer as ArrayBuffer
}        

export function base64ToUint8Array(base64: string): Uint8Array {
    const binaryStr = atob(base64)
    const array = Uint8Array.from(binaryStr, char => char.charCodeAt(0))
    return array
}