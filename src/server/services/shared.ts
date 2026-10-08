import { invalid, notFound } from '../errors'

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

/** A LIKE pattern that finds the text anywhere, with its own % and _ taken literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}
