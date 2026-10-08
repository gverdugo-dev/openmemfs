import { invalid, notFound } from '../errors'
import { COLORS, type Color } from '#/lib/colors'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An id that is not a uuid cannot exist: answer as for one that does not. */
export function checkId(id: string, what: string): string {
  if (typeof id !== 'string' || !UUID.test(id)) throw notFound(`no ${what} with id ${id}`)
  return id
}

export const MAX_NAME_LENGTH = 64

/** A tag or category name: trimmed, 1 to 64 characters, no control characters. */
export function checkName(name: unknown, what: string): string {
  if (typeof name !== 'string') throw invalid(`${what} name is required`)
  const trimmed = name.trim()
  if (trimmed === '') throw invalid(`${what} name is required`)
  if (trimmed.length > MAX_NAME_LENGTH) throw invalid(`${what} name is longer than ${MAX_NAME_LENGTH} characters`)
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) throw invalid(`${what} name has control characters`)
  return trimmed
}


export { COLORS, type Color }

/** A colour from the palette. */
export function checkColor(color: unknown): Color {
  if (!COLORS.includes(color as Color)) throw invalid(`color must be one of ${COLORS.join(', ')}`)
  return color as Color
}

/** The colour a new tag or category gets when none is given: always the same for the same name. */
export function colorFor(name: string): Color {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return COLORS[1 + (hash % (COLORS.length - 1))]!
}

/** A LIKE pattern that finds the text anywhere, with its own % and _ taken literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
