import './load-env'
import { databaseUrl, migrateDatabase } from '@/lib/db'

async function main() {
  const url = databaseUrl()
  if (process.env.VERCEL && url.startsWith('pglite:')) {
    console.error('DATABASE_URL is not set for this Vercel build. Add a Postgres connection string before deploying.')
    process.exit(1)
  }
  await migrateDatabase()
  console.log(`migrations applied (${url.startsWith('pglite:') ? 'pglite' : 'postgres'})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
