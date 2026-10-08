import { createApp } from './app'
import { loadConfig } from './config'
import { connect } from './db'
import { migrate } from './migrate'

/**
 * The one server of this process, built on the first request: it reads the configuration,
 * applies pending migrations (unless MIGRATE_ON_START=false) and builds the API. A failure
 * is not cached, so the next request tries again (a database that was still starting, say).
 */
let instance: Promise<{ app: ReturnType<typeof createApp> }> | undefined

export function getServer() {
  instance ??= start().catch((error) => {
    instance = undefined
    throw error
  })
  return instance
}

async function start() {
  const config = loadConfig()
  const sql = connect(config.databaseUrl)
  if (config.migrateOnStart) {
    const applied = await migrate(sql)
    if (applied.length) console.log(`applied ${applied.join(', ')}`)
  }
  const app = createApp(sql, config)
  // /organisation.md is always there, so it shows in the explorer before any agent asks for it.
  await app.request('http://localhost/api/organisation')
  return { app }
}
