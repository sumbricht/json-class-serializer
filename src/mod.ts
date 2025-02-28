export { JsonClassSerializer } from './json-class-serializer.ts'
export { jsonClass, jsonProperty, jsonArrayProperty, jsonMapProperty, jsonSetProperty, jsonAnyProperty } from './metadata.ts'
export { getJsonClassName } from './utils.ts'
export type { Ctor, CtorOrThunk, MaybeThunk } from './types.ts'
export { AnyType } from './types.ts'

// TODO: remove
export { toJson, jsonObject, jsonMember, jsonArrayMember, jsonMapMember, AnyT } from './metadata.ts'
export const TypedJSON = {} as any
