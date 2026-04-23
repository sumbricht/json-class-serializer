import { Type } from 'typebox'

export const date = Type.String({ format: 'date-time' })
export const dateTime = Type.String({ format: 'date-time' })
export const dateOnly = Type.String({ format: 'date' })
export const timeOnly = Type.String({ format: 'time' })
export const duration = Type.String({ format: 'duration' })
export const email = Type.String({ format: 'email' })
export const hostname = Type.String({ format: 'hostname' })
export const idnEmail = Type.String({ format: 'idn-email' })
export const idnHostname = Type.String({ format: 'idn-hostname' })
export const ipv4 = Type.String({ format: 'ipv4' })
export const ipv6 = Type.String({ format: 'ipv6' })
export const uri = Type.String({ format: 'uri' })
