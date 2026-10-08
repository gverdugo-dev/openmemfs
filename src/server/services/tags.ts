import type { Sql, Tx } from '../db'
import { DomainError, invalid, notFound } from '../errors'
import { checkPath } from '../paths'
import { type Color, checkColor, checkId, checkName, colorFor, isUniqueViolation } from './shared'

export interface Tag {
  id: string
  name: string
  color: Color
  /** How many files carry it on themselves. */
  files: number
  /** The folders that carry it. */
  folders: string[]
}

export type Tags = ReturnType<typeof createTags>

/**
 * Tags: names, unique ignoring case, that relate to files and to folders. A tag is named by
 * its name everywhere (it is unique), and putting one on a file or folder creates it if it
 * does not exist yet. A folder is named by its path with the trailing slash ("/notes/").
 */
export function createTags(sql: Sql) {
  const tags = {
    async list(): Promise<Tag[]> {
      return sql<Tag[]>`
        select t.id, t.name, t.color,
          (select count(*)::int from file_tags ft where ft.tag_id = t.id) as files,
          coalesce((select array_agg(dt.folder order by dt.folder) from folder_tags dt where dt.tag_id = t.id), '{}') as folders
        from tags t order by lower(t.name)`
    },

    /** Creates a tag. Without a colour it gets one from its name. */
    async create(name: string, color?: unknown): Promise<Tag> {
      const checked = checkName(name, 'tag')
      const paint = color === undefined || color === null ? colorFor(checked) : checkColor(color)
      const [row] = await sql<{ id: string }[]>`
        insert into tags (name, color) values (${checked}, ${paint}) on conflict ((lower(name))) do nothing returning id`
      if (!row) throw new DomainError('conflict', `the tag ${checked} already exists`)
      return tags.get(checked)
    },

    async get(name: string): Promise<Tag> {
      const found = (await tags.list()).find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
      if (!found) throw notFound(`no tag ${name}`)
      return found
    },

    /** Renames a tag, changes its colour, or both. What is left out stays. */
    async update(name: string, change: { name?: unknown; color?: unknown }): Promise<Tag> {
      const current = await tags.get(name)
      const checked = change.name === undefined || change.name === null ? current.name : checkName(change.name, 'tag')
      const color = change.color === undefined || change.color === null ? current.color : checkColor(change.color)
      const updated = await sql`update tags set name = ${checked}, color = ${color} where id = ${current.id} returning id`
        .catch((error) => {
          if (isUniqueViolation(error)) throw new DomainError('conflict', `the tag ${checked} already exists`)
          throw error
        })
      if (updated.length === 0) throw notFound(`no tag ${name}`)
      return tags.get(checked)
    },

    /** Deletes the tag, and with it every place it was put. Files and folders stay. */
    async remove(name: string): Promise<void> {
      const deleted = await sql`delete from tags where lower(name) = lower(${name.trim()}) returning id`
      if (deleted.length === 0) throw notFound(`no tag ${name}`)
    },

    async tagFile(fileId: string, name: string): Promise<void> {
      checkId(fileId, 'file')
      await sql.begin(async (tx) => {
        const tagId = await ensure(tx, name)
        const [file] = await tx`select 1 from files where id = ${fileId}`
        if (!file) throw notFound(`no file with id ${fileId}`)
        await tx`insert into file_tags (file_id, tag_id) values (${fileId}, ${tagId}) on conflict do nothing`
      })
    },

    async untagFile(fileId: string, name: string): Promise<void> {
      checkId(fileId, 'file')
      await sql`
        delete from file_tags where file_id = ${fileId}
          and tag_id = (select id from tags where lower(name) = lower(${name.trim()}))`
    },

    /** The tags of a folder itself, not of the folders above it. */
    async ofFolder(folder: string): Promise<string[]> {
      const rows = await sql<{ name: string }[]>`
        select t.name from folder_tags dt join tags t on t.id = dt.tag_id
        where dt.folder = ${checkFolder(folder)} order by lower(t.name)`
      return rows.map((r) => r.name)
    },

    async tagFolder(folder: string, name: string): Promise<string[]> {
      const checked = checkFolder(folder)
      await sql.begin(async (tx) => {
        const [inside] = await tx`
          select 1 from files where starts_with(path, ${checked})
          union all select 1 from folders where starts_with(path, ${checked}) limit 1`
        if (!inside) throw notFound(`no folder ${checked}`)
        const tagId = await ensure(tx, name)
        await tx`insert into folder_tags (folder, tag_id) values (${checked}, ${tagId}) on conflict do nothing`
      })
      return tags.ofFolder(checked)
    },

    async untagFolder(folder: string, name: string): Promise<string[]> {
      const checked = checkFolder(folder)
      await sql`
        delete from folder_tags where folder = ${checked}
          and tag_id = (select id from tags where lower(name) = lower(${name.trim()}))`
      return tags.ofFolder(checked)
    },
  }
  return tags
}

/** The id of the tag with this name, creating it when it does not exist. */
async function ensure(tx: Tx, name: string): Promise<string> {
  const checked = checkName(name, 'tag')
  await tx`insert into tags (name, color) values (${checked}, ${colorFor(checked)}) on conflict ((lower(name))) do nothing`
  const [tag] = await tx<{ id: string }[]>`select id from tags where lower(name) = lower(${checked})`
  return tag!.id
}

/** A folder path with its trailing slash, "/notes/". The root cannot carry tags: that would be every file. */
export function checkFolder(folder: unknown): string {
  if (typeof folder !== 'string' || folder === '' || folder === '/') {
    throw invalid('folder is required, like "/notes/" (the root cannot carry tags)')
  }
  return `${checkPath(folder.replace(/\/$/, ''))}/`
}
