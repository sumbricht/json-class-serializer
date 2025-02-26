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
	  a.forEach((value, key) => {
		assertSimilarInstances(value, b.get(key))
	  })
	} else if(a instanceof Set) {
	  assertEquals(a.size, b.size)
	  assertSimilarInstances(Array.from(a), Array.from(b))
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