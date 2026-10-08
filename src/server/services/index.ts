import type { Sql } from '../db'
import { createCategories } from './categories'
import { createFiles, type WriteHook } from './files'
import { createFolders } from './folders'
import { createOrganisation } from './organisation'
import { createTags } from './tags'

export type Services = ReturnType<typeof createServices>

/**
 * The service layer: every rule of the memory lives here. The two doors, the REST API
 * (`api.ts`) and the MCP tools (`mcp.ts`), only translate a request into a call to one of
 * these and its answer back, so a person and an agent can do exactly the same things.
 */
export function createServices(sql: Sql, afterWrite: WriteHook[] = []) {
  const files = createFiles(sql, afterWrite)
  return {
    files,
    organisation: createOrganisation(files),
    folders: createFolders(sql),
    tags: createTags(sql),
    categories: createCategories(sql),
  }
}

export type { Author, Entry, File, Metadata, Search, Write, WriteHook } from './files'
export type { Category } from './categories'
export type { Organisation } from './organisation'
export type { Tag } from './tags'
