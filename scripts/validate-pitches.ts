import { readFileSync } from 'node:fs'
import { checkPitch } from '@/lib/pitch/validate'

interface ContactRow {
  firstName: string
  lastName: string
  company: string
  email: string
}

const [pitchesPath, contactsPath] = process.argv.slice(2)
if (!pitchesPath || !contactsPath) {
  console.error('usage: tsx scripts/validate-pitches.ts <pitches.json> <contacts.json>')
  process.exit(2)
}

const pitches = JSON.parse(readFileSync(pitchesPath, 'utf8')) as Record<string, unknown>
const contacts = JSON.parse(readFileSync(contactsPath, 'utf8')) as ContactRow[]

let errorCount = 0
let warningCount = 0
let missing = 0

for (const contact of contacts) {
  const key = contact.email.toLowerCase()
  const pitch = pitches[key]
  if (!pitch) {
    missing += 1
    console.log(`MISSING ${key}`)
    continue
  }
  const result = checkPitch(pitch, contact)
  errorCount += result.errors.length
  warningCount += result.warnings.length
  if (result.errors.length || result.warnings.length) {
    console.log(`${result.ok ? 'WARN' : 'FAIL'} ${key}`)
    for (const error of result.errors) console.log(`  error: ${error}`)
    for (const warning of result.warnings) console.log(`  warning: ${warning}`)
  }
}

const extra = Object.keys(pitches).filter((key) => !contacts.some((contact) => contact.email.toLowerCase() === key))
for (const key of extra) console.log(`EXTRA ${key}`)

console.log(`\n${contacts.length} contacts, ${missing} missing, ${errorCount} errors, ${warningCount} warnings, ${extra.length} extra`)
process.exit(errorCount > 0 || missing > 0 || extra.length > 0 ? 1 : 0)
