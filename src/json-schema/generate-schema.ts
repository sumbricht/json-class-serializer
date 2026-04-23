import { type TSchema, Type } from 'typebox'
import { classDataByCtor } from '../metadata.ts'
import { resolveThunk } from '../types.ts'
import { date } from './schema-util.ts'

export function generateSchema(
	rootClasses: any[],
	refClass: any = undefined,
	recursive = true,
) {
	if (refClass && !rootClasses.includes(refClass)) {
		throw new Error(
			`Ref class ${refClass.name} is not a root class. Please provide a root class as the second argument.`,
		)
	}

	const visitedClasses = new Set<any>()
	const graphObj: Record<string, TSchema> = {}

	function processClass(clazz: any) {
		const className = clazz.name
		const refName = `#/defs/${className}`
		if (visitedClasses.has(clazz)) return Type.Ref(refName)
		visitedClasses.add(clazz)

		const classData = classDataByCtor.get(clazz)
		if (!classData)
			throw new Error(`Class ${className} is not registered with @jsonClass`)

		const schemaProperties: any = {}
		for (const [key, property] of classData.properties ?? []) {
			// Any type
			if (property.type === 'any') {
				schemaProperties[key] = Type.Any()
				continue
			}

			// Map type
			if (property.type === 'map') {
				const keyCtor = resolveThunk(property.keyCtorOrThunk)
				const valueCtor = resolveThunk(property.valueCtorOrThunk)
				if (!keyCtor || !valueCtor)
					throw new Error(
						`Property ${clazz.name}.${key?.toString()} is not properly registered with @jsonMapProperty`,
					)
				if (keyCtor !== String)
					throw new Error(
						`Property ${clazz.name}.${key?.toString()} key type must be String`,
					)

				schemaProperties[key] = Type.Mapped(
					Type.Identifier('K'),
					Type.String(),
					Type.Ref('K'),
					processClass(valueCtor),
				)
				continue
			}

			// Enum type
			if (property.type === 'enum') {
				if (property.values.length > 1) {
					schemaProperties[key] = Type.Enum(property.values as any[])
				} else {
					schemaProperties[key] = Type.Literal(property.values[0])
				}
				continue
			}

			// Class type
			const ctor = resolveThunk(property.valueCtorOrThunk)
			if (!ctor)
				throw new Error(
					`Property ${clazz.name}.${key?.toString()} is not propertly registered with @jsonProperty(ctorOrThunk). Please provide a constructor or an arrow function that returns the constructor, even for primitive types`,
				)

			if (property.type === 'class') {
				if (ctor === String) {
					schemaProperties[key] = Type.String()
					continue
				}
				if (ctor === Number) {
					schemaProperties[key] = Type.Number()
					continue
				}
				if (ctor === Boolean) {
					schemaProperties[key] = Type.Boolean()
					continue
				}
				if (ctor === Date) {
					schemaProperties[key] = date
					continue
				}
				if (ctor === BigInt) {
					schemaProperties[key] = Type.BigInt()
					continue
				}
				if (ctor === ArrayBuffer || ctor === Uint8Array || ctor === DataView) {
					schemaProperties[key] = Type.String()
					continue
				}

				if (recursive) {
					schemaProperties[key] = processClass(ctor)
				}
			}

			// Array or set type
			if (property.type === 'array' || property.type === 'set') {
				schemaProperties[key] = Type.Array(processClass(ctor))
			}
		}

		let schema: TSchema = Type.Object(schemaProperties, {
			// $id: className,
		})

		// Check parent class
		if (Object.getPrototypeOf(clazz) !== Function.prototype) {
			schema = Type.Intersect([
				schema,
				processClass(Object.getPrototypeOf(clazz)),
			])
		}

		graphObj[className] = schema
		return Type.Ref(refName)
	}

	for (const clazz of rootClasses) {
		processClass(clazz)
	}

	const module = {
		$ref: refClass ? `#/defs/${refClass.name}` : undefined,
		$defs: Type.Module(graphObj),
	}
	return module
}
