import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts } from '@/lib/db/schema'
import { needsHold } from '@/lib/contacts/compliance'
import { checkPitch } from './validate'
import { savePitch } from './store'

export interface PitchImportSummary {
  saved: number
  approved: number
  missingContact: string[]
  invalid: Array<{ email: string; errors: string[] }>
}

export async function importPitchMap(db: Database, map: Record<string, unknown>, options: { approveClean: boolean }): Promise<PitchImportSummary> {
  const summary: PitchImportSummary = { saved: 0, approved: 0, missingContact: [], invalid: [] }
  for (const [rawEmail, value] of Object.entries(map)) {
    const email = rawEmail.trim().toLowerCase()
    const rows = await db.select().from(contacts).where(eq(contacts.email, email)).limit(1)
    const contact = rows[0]
    if (!contact) {
      summary.missingContact.push(email)
      continue
    }
    const check = checkPitch(value, { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company })
    if (!check.ok || !check.pitch) {
      summary.invalid.push({ email, errors: check.errors })
      continue
    }
    const approve = options.approveClean && check.warnings.length === 0 && !needsHold([...contact.flags, ...check.pitch.flags]) && contact.reviewStatus !== 'excluded'
    const result = await savePitch(db, contact.id, check.pitch, { source: 'import', warnings: check.warnings, approve })
    summary.saved += 1
    if (result.reviewStatus === 'approved') summary.approved += 1
  }
  return summary
}
