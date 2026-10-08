import { LOOPBACK_HOSTS } from './guard'

export interface Config {
  /** Postgres connection string. */
  databaseUrl: string
  /** Saves by the same author closer than this fold into one version. 0 keeps every save. */
  versionWindowSeconds: number
  /** Whether the server applies pending migrations when it starts. */
  migrateOnStart: boolean
  /** The host names /api and /mcp answer to, or '*' for any. Loopback names by default. */
  allowedHosts?: string[] | '*'
}

/** Reads the configuration from the environment and refuses to start without the essentials. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  return {
    databaseUrl,
    versionWindowSeconds: integer(env.VERSION_WINDOW_SECONDS, 300),
    migrateOnStart: env.MIGRATE_ON_START !== 'false',
    allowedHosts: hosts(env.ALLOWED_HOSTS),
  }
}

/** A comma-separated list of host names, without ports; `*` for any. */
function hosts(value: string | undefined): string[] | '*' {
  if (value === undefined || value.trim() === '') return LOOPBACK_HOSTS
  if (value.trim() === '*') return '*'
  return [...LOOPBACK_HOSTS, ...value.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)]
}

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new Error(`expected a non-negative integer, got "${value}"`)
  return n
}
