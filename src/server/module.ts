import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Hono, MiddlewareHandler } from 'hono'
import type { Config } from './config'
import type { Sql, Table } from './db'
import type { Author, ContentLimit, Services, WriteHook } from './services'

/**
 * What every request handler can read: who is writing, and which folders the request reaches
 * (null for the whole memory). A module's middleware may set both; the services read them
 * through `caller()` (see `caller.ts`).
 */
export type AppEnv = { Variables: { author: Author; reach: string[] | null } }

/** The API a module adds its routes to. Every route is under /api, behind the guard and every middleware. */
export type Api = Hono<AppEnv>

/** The whole server, for the routes a module needs before the guard and the middlewares. */
export type App = Hono<AppEnv>

export interface ModuleContext {
  sql: Sql
  /**
   * A table qualified with the schema the memory lives in: `select * from ${table('history_x')}`.
   * Every query names its tables through it; none relies on `search_path`.
   */
  table: (name: string) => Table
  /** The service layer. A module writes files through it, never with its own SQL on `files`. */
  services: Services
  config: Config
}

export interface ModuleParts {
  /**
   * Runs before every request to /api and /mcp (not /api/health), after the guard and in the
   * order of the registry. It may answer on its own (a 401 to close the memory), name the
   * author (`c.set('author', email)`) or narrow what the request reaches
   * (`c.set('reach', ['/work/acme/'])`). This is where access control goes.
   */
  middleware?: MiddlewareHandler<AppEnv>
  /**
   * Routes that must come before the guard and the middlewares, such as a sign-in callback or
   * an OAuth endpoint that takes a form from another site. Mounted on the whole server: give
   * them full paths (`/api/<module>/...`), and remember nothing protects them.
   */
  openRoutes?: (app: App) => void
  /** Runs inside the transaction of every file write, after the row is written. */
  afterWrite?: WriteHook
  /** A larger content limit for some files, such as media kept as data URLs. */
  contentLimit?: ContentLimit
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
