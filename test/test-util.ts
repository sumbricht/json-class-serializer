import { assertEquals } from "@std/assert";

export function assertSimilarInstances(a: any, b: any): void {
  assertEquals(a?.constructor, b?.constructor)
  if(a && typeof a == 'object') {
	if (a instanceof Date) {
	  assertEquals(a.getTime(), b.getTime())
	} else if(Array.isArray(a)) {
	  assertEquals(a.length, b.length)
	  a.forEach((item, idx) => assertSimilarInstances(item, b[idx]))
	} else if(a instanceof Map) {
	  assertEquals(a.size, b.size)
	  const aEntries = Array.from(a.entries())
	  const bEntries = Array.from(b.entries())
	  assertSimilarInstances(aEntries, bEntries)
	} else if(a instanceof Set) {
	  assertEquals(a.size, b.size)
	  assertSimilarInstances(Array.from(a), Array.from(b))
	} else if (a instanceof ArrayBuffer) {
		assertEquals(a.byteLength, b.byteLength)
		const aView = new Uint8Array(a)
		const bView = new Uint8Array(b)
		for (let i = 0; i < a.byteLength; i++) {
			assertEquals(aView[i], bView[i])
		}
	} else if (a instanceof DataView) {
		assertEquals(a.byteLength, b.byteLength)
		const aView = new Uint8Array(a.buffer)
		const bView = new Uint8Array(b.buffer)
		for (let i = 0; i < a.byteLength; i++) {
			assertEquals(aView[i], bView[i])
		}
	} else if (a instanceof Uint8Array) {
		assertEquals(a.length, b.length)
		for (let i = 0; i < a.length; i++) {
			assertEquals(a[i], b[i])
		}
	} else if (typeof a === 'object') {
	  for (const key in a) {
		assertSimilarInstances(a[key], b[key])
	  }
	} else {
	  assertEquals(a, b)
	}
  } else {
	assertEquals(a, b)
  }
}