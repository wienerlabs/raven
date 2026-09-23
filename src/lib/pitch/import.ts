import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts } from '@/lib/db/schema'
import { needsHold } from '@/lib/contacts/compliance'
import { checkPitch } from './validate'
import { savePitch } from './store'

export interface PitchImportSummary {
  saved: number
  approved: number
  held: number
  flaggedForCheck: number
  missingContact: string[]
  invalid: Array<{ email: string; errors: string[] }>
}

interface ReviewEnvelope {
  pitch: unknown
  hold?: string
  check?: string
}

function unwrap(value: unknown): { pitch: unknown; hold: string | null; check: string | null } {
  if (value && typeof value === 'object' && 'pitch' in value) {
    const envelope = value as ReviewEnvelope
    const hold = typeof envelope.hold === 'string' && envelope.hold.trim() ? envelope.hold.trim().slice(0, 400) : null
    const check = typeof envelope.check === 'string' && envelope.check.trim() ? envelope.check.trim().slice(0, 600) : null
    return { pitch: envelope.pitch, hold, check }
  }
  return { pitch: value, hold: null, check: null }
}

function appendNote(existing: string | null, note: string): string {
  if (existing?.includes(note)) return existing
  return existing ? `${existing}\n\n${note}` : note
}

export async function importPitchMap(db: Database, map: Record<string, unknown>, options: { approveClean: boolean }): Promise<PitchImportSummary> {
  const summary: PitchImportSummary = { saved: 0, approved: 0, held: 0, flaggedForCheck: 0, missingContact: [], invalid: [] }
  for (const [rawEmail, value] of Object.entries(map)) {
    const email = rawEmail.trim().toLowerCase()
    const rows = await db.select().from(contacts).where(eq(contacts.email, email)).limit(1)
    const contact = rows[0]
    if (!contact) {
      summary.missingContact.push(email)
      continue
    }
    const entry = unwrap(value)
    const check = checkPitch(entry.pitch, { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company })
    if (!check.ok || !check.pitch) {
      summary.invalid.push({ email, errors: check.errors })
      continue
    }
    const approve = options.approveClean && !entry.hold && !entry.check && check.warnings.length === 0 && !needsHold([...contact.flags, ...check.pitch.flags]) && contact.reviewStatus !== 'excluded'
    const result = await savePitch(db, contact.id, check.pitch, { source: 'import', warnings: check.warnings, approve })
    summary.saved += 1
    if (entry.hold) {
      await db
        .update(contacts)
        .set({ reviewStatus: 'hold', holdReason: entry.hold, notes: appendNote(contact.notes, `Bekletme nedeni: ${entry.hold}`), updatedAt: new Date() })
        .where(eq(contacts.id, contact.id))
      summary.held += 1
      continue
    }
    if (entry.check) {
      await db.update(contacts).set({ notes: appendNote(contact.notes, `Göndermeden önce kontrol: ${entry.check}`), updatedAt: new Date() }).where(eq(contacts.id, contact.id))
      summary.flaggedForCheck += 1
    }
    if (result.reviewStatus === 'approved') summary.approved += 1
    if (result.reviewStatus === 'hold') summary.held += 1
  }
  return summary
}
