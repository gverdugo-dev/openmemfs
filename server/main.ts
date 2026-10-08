import { createApp } from './app'
import { loadConfig } from './config'
import { connect } from './db'
import { migrate } from './migrate'

const config = loadConfig()
const sql = connect(config.databaseUrl)

if (config.migrateOnStart) {
  const applied = await migrate(sql)
  if (applied.length) console.log(`applied ${applied.join(', ')}`)
}

const app = createApp(sql, config)
const server = Bun.serve({ port: config.port, hostname: process.env.HOST ?? '0.0.0.0', fetch: app.fetch })
console.log(`openmemfs listening on http://${server.hostname}:${server.port}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop()
    await sql.end({ timeout: 5 })
    process.exit(0)
  })
}
