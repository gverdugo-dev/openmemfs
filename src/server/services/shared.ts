import type { Tables, Tx } from '../db'
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

/** Any constant works; it only has to be the same in every process. */
const STRUCTURE_LOCK = 4_206_573_354

/**
 * Serialises the writes that create, rename or move a name, so two of them cannot both pass
 * the "a name cannot be a file and a folder" check. A transaction lock, so it holds behind a
 * transaction pooler too.
 */
export async function lockStructure(tx: Tx): Promise<void> {
  await tx`select pg_advisory_xact_lock(${STRUCTURE_LOCK})`
}

/**
 * Drops the tags of folders that no longer exist: no file under them and no created folder.
 * A folder that comes back later with the same path starts without tags.
 */
export async function dropOrphanFolderTags(tb: Tables, tx: Tx): Promise<void> {
  await tx`
    delete from ${tb.folder_tags} dt
    where not exists (select 1 from ${tb.files} where starts_with(path, dt.folder))
      and not exists (select 1 from ${tb.folders} where starts_with(path, dt.folder))`
}
