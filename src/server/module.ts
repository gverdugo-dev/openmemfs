import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono } from 'hono'
import type { Config } from './config'
import type { Sql } from './db'
import type { Author, Services, WriteHook } from './services'

/** What every request handler can read: who is writing. */
export type AppEnv = { Variables: { author: Author } }

/** The API a module adds its routes to. Every route is under /api and already authenticated. */
export type Api = Hono<AppEnv>

export interface ModuleContext {
  sql: Sql
  /** The service layer. A module writes files through it, never with its own SQL on `files`. */
  services: Services
  config: Config
}

export interface ModuleParts {
  /** Runs inside the transaction of every file write, after the row is written. */
  afterWrite?: WriteHook
  /** Adds routes under /api. Prefix them with the module id or hang them under /files/:id/<module>. */
  routes?: (api: Api) => void
  /**
   * Adds MCP tools, registered with `tool()` from `#/server/mcp`. Whatever a module lets a
   * person do through its routes, it lets an agent do through a tool.
   */
  tools?: (mcp: McpServer) => void
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
