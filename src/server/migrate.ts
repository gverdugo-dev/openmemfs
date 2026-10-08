import { readdir, readFile } from 'node:fs/promises'
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
 * in `openmemfs_migrations` as `<owner>/<file>`. A transaction-scoped advisory lock lets
 * several instances start at once, also behind a transaction pooler. Returns the ids it applied.
 */
export async function migrate(sql: Sql, modules: ServerModule[] = serverModules): Promise<string[]> {
  const sources = [{ owner: 'core', dir: CORE_MIGRATIONS }]
  for (const module of modules) if (module.migrations) sources.push({ owner: module.id, dir: module.migrations })

  const applied: string[] = []
  // Under the lock too: two `create table if not exists` at once can still collide.
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK_KEY})`
    await tx`
      create table if not exists openmemfs_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )`
  })
  for (const { owner, dir } of sources) {
    const files = (await readdir(join(process.cwd(), dir))).filter((f) => f.endsWith('.sql')).sort()
    for (const file of files) {
      if (!MIGRATION_FILE.test(file)) throw new Error(`${join(dir, file)}: name it NNNN_snake_case.sql`)
      const id = `${owner}/${file}`
      const text = await readFile(join(process.cwd(), dir, file), 'utf8')
      // A transaction lock holds behind a transaction pooler (Supabase, PgBouncer), where a
      // session lock could be taken on one connection and released on another. Whoever waited
      // looks again once it has the lock, and skips what the other instance applied.
      const ran = await sql
        .begin(async (tx) => {
          await tx`select pg_advisory_xact_lock(${LOCK_KEY})`
          const [done] = await tx`select 1 from openmemfs_migrations where id = ${id}`
          if (done) return false
          await tx.unsafe(text)
          await tx`insert into openmemfs_migrations (id) values (${id})`
          return true
        })
        .catch((error: Error) => {
          throw new Error(`migration ${id} failed: ${error.message}`)
        })
      if (ran) applied.push(id)
    }
  }
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
