export interface Config {
  /** Postgres connection string. */
  databaseUrl: string
  /** The one access token: agents send it as a Bearer token, people type it to sign in. */
  token: string
  /** Saves by the same author closer than this fold into one version. 0 keeps every save. */
  versionWindowSeconds: number
  /** Whether the server applies pending migrations when it starts. */
  migrateOnStart: boolean
}

export const MIN_TOKEN_LENGTH = 16

/** Reads the configuration from the environment and refuses to start without the essentials. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const token = env.OPENMEMFS_TOKEN ?? ''
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`OPENMEMFS_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters (try: openssl rand -hex 32)`)
  }
  return {
    databaseUrl,
    token,
    versionWindowSeconds: integer(env.VERSION_WINDOW_SECONDS, 300),
    migrateOnStart: env.MIGRATE_ON_START !== 'false',
  }
}

function integer(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new Error(`expected a non-negative integer, got "${value}"`)
  return n
}
