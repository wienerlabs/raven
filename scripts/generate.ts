import './load-env'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { contacts, pitches } from '@/lib/db/schema'
import { generateForContact } from '@/lib/pitch/pipeline'
import { hasAi } from '@/lib/env'

async function main() {
  if (!hasAi()) {
    console.error('ANTHROPIC_API_KEY is not set')
    process.exit(2)
  }
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity
  const concurrency = 4
  const db = await getDb()
  const rows = await db
    .select({ id: contacts.id, email: contacts.email })
    .from(contacts)
    .leftJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(isNull(pitches.id), ne(contacts.reviewStatus, 'excluded')))
  const queue = rows.slice(0, Number.isFinite(limit) ? limit : rows.length)
  console.log(`generating ${queue.length} pitches with concurrency ${concurrency}`)
  let done = 0
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (!next) break
      const outcome = await generateForContact(db, next.id)
      done += 1
      console.log(`${done} ${next.email ?? next.id} ${outcome.ok ? `ok (${outcome.warnings} warnings)` : `failed: ${outcome.error}`}`)
    }
  })
  await Promise.all(workers)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
