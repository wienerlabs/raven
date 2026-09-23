import './load-env'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { getDb } from '@/lib/db'
import { importContacts, parseSpreadsheet } from '@/lib/contacts/import'

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: npm run import:contacts -- <file.xlsx|file.csv>')
    process.exit(2)
  }
  const parsed = await parseSpreadsheet(new Uint8Array(readFileSync(file)), basename(file))
  console.log(`parsed ${parsed.rows.length} rows, skipped ${parsed.skipped}, columns ${JSON.stringify(parsed.mapping)}`)
  const db = await getDb()
  const summary = await importContacts(db, parsed.rows, basename(file), parsed.skipped)
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
