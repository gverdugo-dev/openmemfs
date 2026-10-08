import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { serverModules } from '#/modules/server'
import { connect, type Sql } from './db'
import type { ServerModule } from './module'

/** Migration folders are relative to the project root, where the server and the CLI run. */
const CORE_MIGRATIONS = 'migrations'
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/
/** Any constant works; it only has to be the same in every process that migrates. */
const LOCK_KEY = 4_206_573_353

/**
 * Applies the pending migrations: first the core ones in `migrations/`, then each module's,
 * in the order of the registry. Each file runs once, in its own transaction, and is recorded
 * in `openmemfs_migrations` as `<owner>/<file>`. An advisory lock lets several instances
 * start at once. Returns the ids it applied.
 */
export async function migrate(sql: Sql, modules: ServerModule[] = serverModules): Promise<string[]> {
  const sources = [{ owner: 'core', dir: CORE_MIGRATIONS }]
  for (const module of modules) if (module.migrations) sources.push({ owner: module.id, dir: module.migrations })

  const applied: string[] = []
  await sql.reserve().then(async (conn) => {
    try {
      await conn`select pg_advisory_lock(${LOCK_KEY})`
      await conn`
        create table if not exists openmemfs_migrations (
          id text primary key,
          applied_at timestamptz not null default now()
        )`
      const done = new Set((await conn<{ id: string }[]>`select id from openmemfs_migrations`).map((r) => r.id))
      for (const { owner, dir } of sources) {
        const files = (await readdir(join(process.cwd(), dir))).filter((f) => f.endsWith('.sql')).sort()
        for (const file of files) {
          if (!MIGRATION_FILE.test(file)) throw new Error(`${join(dir, file)}: name it NNNN_snake_case.sql`)
          const id = `${owner}/${file}`
          if (done.has(id)) continue
          const text = await Bun.file(join(process.cwd(), dir, file)).text()
          await conn.unsafe('begin')
          try {
            await conn.unsafe(text)
            await conn`insert into openmemfs_migrations (id) values (${id})`
            await conn.unsafe('commit')
          } catch (error) {
            await conn.unsafe('rollback')
            throw new Error(`migration ${id} failed: ${(error as Error).message}`)
          }
          applied.push(id)
        }
      }
    } finally {
      await conn`select pg_advisory_unlock(${LOCK_KEY})`
      conn.release()
    }
  })
  return applied
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const sql = connect(url)
  const applied = await migrate(sql)
  console.log(applied.length ? `applied ${applied.join(', ')}` : 'nothing to migrate')
  await sql.end()
}
