import path from 'node:path'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import * as schema from './schema'

export type Schema = typeof schema
export type Database = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>

const globalForDb = globalThis as unknown as { ravenDb?: Promise<Database> }

export function migrationsFolder(): string {
  return path.join(process.cwd(), 'drizzle')
}

export async function createPgliteDb(target: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const client = target === 'memory' ? new PGlite() : new PGlite(target)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: migrationsFolder() })
  return db as unknown as Database
}

async function createPostgresDb(url: string): Promise<Database> {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const client = postgres(url, { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 15 })
  return drizzle(client, { schema }) as unknown as Database
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || 'pglite:./.data/raven'
}

export function getDb(): Promise<Database> {
  if (!globalForDb.ravenDb) {
    const url = databaseUrl()
    globalForDb.ravenDb = url.startsWith('pglite:') ? createPgliteDb(url.slice('pglite:'.length)) : createPostgresDb(url)
    globalForDb.ravenDb.catch(() => {
      globalForDb.ravenDb = undefined
    })
  }
  return globalForDb.ravenDb
}

export async function migrateDatabase(): Promise<void> {
  const url = databaseUrl()
  if (url.startsWith('pglite:')) {
    await createPgliteDb(url.slice('pglite:'.length))
    return
  }
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const { migrate } = await import('drizzle-orm/postgres-js/migrator')
  const client = postgres(url, { max: 1, prepare: false })
  try {
    await migrate(drizzle(client, { schema }), { migrationsFolder: migrationsFolder() })
  } finally {
    await client.end()
  }
}
