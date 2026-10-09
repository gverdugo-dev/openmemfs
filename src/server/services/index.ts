import { type Sql, type Tables, tablesOf } from '../db'
import { createCategories } from './categories'
import { createFiles, type FileHooks } from './files'
import { createFolders } from './folders'
import { createOrganisation } from './organisation'
import { createTags } from './tags'

export type Services = ReturnType<typeof createServices>

/**
 * The service layer: every rule of the memory lives here. The two doors, the REST API
 * (`api.ts`) and the MCP tools (`mcp.ts`), only translate a request into a call to one of
 * these and its answer back, so a person and an agent can do exactly the same things.
 */
export function createServices(sql: Sql, hooks: FileHooks = {}, tables: Tables = tablesOf(sql)) {
  const files = createFiles(sql, hooks, tables)
  return {
    files,
    organisation: createOrganisation(files),
    folders: createFolders(sql, files, tables),
    tags: createTags(sql, tables),
    categories: createCategories(sql, tables),
  }
}

export type { Author, ContentLimit, Entry, File, FileHooks, FileLines, Metadata, Search, SearchIn, Trashed, Write, WriteFile, WriteHook } from './files'
export { SEARCH_IN } from './files'
export type { FolderContents, FolderEntry, TreeFolder } from './folders'
export type { Category } from './categories'
export type { Organisation } from './organisation'
export type { Tag } from './tags'
