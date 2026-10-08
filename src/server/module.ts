import type { Hono } from 'hono'
import type { Config } from './config'
import type { Sql } from './db'
import type { Author, Files, WriteHook } from './files'

/** What every request handler can read: who is writing. */
export type AppEnv = { Variables: { author: Author } }

/** The API a module adds its routes to. Every route is under /api and already authenticated. */
export type Api = Hono<AppEnv>

export interface ModuleContext {
  sql: Sql
  /** The file service. A module writes files through it, never with its own SQL on `files`. */
  files: Files
  config: Config
}

export interface ModuleParts {
  /** Runs inside the transaction of every file write, after the row is written. */
  afterWrite?: WriteHook
  /** Adds routes under /api. Prefix them with the module id or hang them under /files/:id/<module>. */
  routes?: (api: Api) => void
}

/**
 * The server side of a module. Listed in `modules/server.ts`; its front side, if any, is
 * listed in `modules/web.ts` with the same id.
 */
export interface ServerModule {
  /** Unique, kebab-case. Also names the module's migrations in the control table. */
  id: string
  /**
   * Folder of `NNNN_name.sql` files, relative to the project root (`src/modules/<id>/migrations`),
   * applied after the core ones.
   */
  migrations?: string
  setup?: (ctx: ModuleContext) => ModuleParts
}
