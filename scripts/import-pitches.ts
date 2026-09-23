import './load-env'
import { readFileSync } from 'node:fs'
import { getDb } from '@/lib/db'
import { importPitchMap } from '@/lib/pitch/import'

async function main() {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
  const approveClean = process.argv.includes('--approve-clean')
  if (files.length === 0) {
    console.error('usage: npm run import:pitches -- <pitches.json> [more.json] [--approve-clean]')
    process.exit(2)
  }
  const map: Record<string, unknown> = {}
  for (const file of files) Object.assign(map, JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>)
  const db = await getDb()
  const summary = await importPitchMap(db, map, { approveClean })
  console.log(`saved ${summary.saved}, approved ${summary.approved}, invalid ${summary.invalid.length}, missing contact ${summary.missingContact.length}`)
  for (const item of summary.invalid) console.log(`invalid ${item.email}: ${item.errors.join('; ')}`)
  for (const email of summary.missingContact) console.log(`missing ${email}`)
  process.exit(summary.invalid.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
