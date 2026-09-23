import { randomBytes } from 'node:crypto'
import { createPgliteDb, migrationsFolder, type Database } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export interface TestDatabase {
  db: Database
  close: () => Promise<void>
}

export async function openTestDb(): Promise<TestDatabase> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) return { db: await createPgliteDb('memory'), close: async () => undefined }
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  const { migrate } = await import('drizzle-orm/postgres-js/migrator')
  const admin = postgres(url, { max: 1, onnotice: () => undefined })
  const name = `raven_test_${randomBytes(5).toString('hex')}`
  await admin.unsafe(`create database ${name}`)
  const target = new URL(url)
  target.pathname = `/${name}`
  const client = postgres(target.toString(), { max: 4, prepare: false, onnotice: () => undefined })
  const db = drizzle(client, { schema }) as unknown as Database
  await migrate(drizzle(client, { schema }), { migrationsFolder: migrationsFolder() })
  return {
    db,
    close: async () => {
      await client.end()
      await admin.unsafe(`drop database if exists ${name} with (force)`)
      await admin.end()
    },
  }
}
