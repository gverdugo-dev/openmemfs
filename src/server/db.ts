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
