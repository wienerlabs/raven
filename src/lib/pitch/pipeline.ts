import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts } from '@/lib/db/schema'
import { generatePitch } from '@/lib/ai/generate'
import type { PitchInput } from '@/lib/ai/prompt'
import { researchDomain } from '@/lib/research'
import { freeMailDomains } from '@/lib/research/website'
import { getSettings } from '@/lib/settings'
import { savePitch } from './store'

export interface GenerateOutcome {
  contactId: string
  ok: boolean
  error: string | null
  warnings: number
}

export async function buildPitchInput(db: Database, contactId: string): Promise<{ input: PitchInput; context: { firstName: string; lastName: string; email: string | null; company: string } } | null> {
  const rows = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  const contact = rows[0]
  if (!contact) return null
  const settings = await getSettings(db)
  const research = contact.domain && !freeMailDomains.has(contact.domain) ? await researchDomain(db, contact.domain) : null
  const input: PitchInput = {
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title,
      company: contact.company,
      companyForEmails: contact.companyForEmails,
      email: contact.email,
      phone: contact.phone,
      domain: contact.domain,
      relationship: contact.relationship,
      notes: contact.notes,
    },
    research: research ? { url: research.url, title: research.title, description: research.description, excerpt: research.excerpt } : null,
    sender: { fullName: settings.sender.fullName, firstName: settings.sender.firstName, title: settings.sender.title, company: settings.sender.company },
    offer: settings.offer,
    today: new Date().toISOString().slice(0, 10),
  }
  return { input, context: { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company } }
}

export async function generateForContact(db: Database, contactId: string): Promise<GenerateOutcome> {
  try {
    const built = await buildPitchInput(db, contactId)
    if (!built) return { contactId, ok: false, error: 'contact not found', warnings: 0 }
    const generated = await generatePitch(built.input, built.context)
    await savePitch(db, contactId, generated.pitch, { source: 'ai', model: generated.model, warnings: generated.warnings })
    return { contactId, ok: true, error: null, warnings: generated.warnings.length }
  } catch (error) {
    return { contactId, ok: false, error: error instanceof Error ? error.message : String(error), warnings: 0 }
  }
}
