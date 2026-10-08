import postgres from 'postgres'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

/**
 * Opens the pool. No named prepared statements, so it also works behind a pooler in
 * transaction mode (Supabase, PgBouncer), where they do not survive between queries.
 */
export function connect(url: string): Sql {
  return postgres(url, { prepare: false, onnotice: () => {} })
}

/** The Postgres schema openmemfs keeps its tables in when DATABASE_SCHEMA is not set. */
export const DEFAULT_SCHEMA = 'public'

/**
 * A table name qualified with the schema, ready to drop into a query: `select * from ${t.files}`.
 * Queries never rely on `search_path`, which a pooler in transaction mode does not keep.
 */
export type Table = postgres.Helper<string, []>

/** The core tables, qualified with the schema. Modules ask for theirs with `table(name)`. */
export function tablesOf(sql: Sql, schema: string = DEFAULT_SCHEMA) {
  const table = (name: string): Table => sql(`${schema}.${name}`)
  return {
    table,
    files: table('files'),
    folders: table('folders'),
    folder_tags: table('folder_tags'),
    file_tags: table('file_tags'),
    tags: table('tags'),
    categories: table('categories'),
  }
}

export type Tables = ReturnType<typeof tablesOf>
