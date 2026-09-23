import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, pitches } from '@/lib/db/schema'
import { findMessageByToken, recordEvent, suppress } from '@/lib/campaign/state'

export async function contactBySlug(db: Database, slug: string) {
  if (!/^[A-Za-z0-9]{6,32}$/.test(slug)) return null
  const rows = await db.select().from(contacts).where(eq(contacts.slug, slug)).limit(1)
  const contact = rows[0]
  if (!contact) return null
  const [pitch] = await db.select().from(pitches).where(eq(pitches.contactId, contact.id)).limit(1)
  return pitch ? { contact, pitch: pitch.content } : null
}

export async function isTestToken(db: Database, token: string | null | undefined): Promise<boolean> {
  if (!token) return false
  const message = await findMessageByToken(db, token)
  return Boolean(message?.isTest)
}

export async function tokenContext(db: Database, token: string) {
  const message = await findMessageByToken(db, token)
  if (!message) return null
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, message.contactId)).limit(1)
  const [pitch] = await db.select().from(pitches).where(eq(pitches.contactId, message.contactId)).limit(1)
  return contact ? { message, contact, language: pitch?.content.language ?? 'tr' } : null
}

export async function unsubscribeToken(db: Database, token: string, via: 'page' | 'one-click'): Promise<boolean> {
  const message = await findMessageByToken(db, token)
  if (!message || message.isTest) return false
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, message.contactId)).limit(1)
  if (!contact) return false
  if (contact.email) await suppress(db, { contactId: contact.id, value: contact.email, kind: 'email', reason: 'unsubscribe' })
  if (contact.phone) await suppress(db, { contactId: contact.id, value: contact.phone, kind: 'phone', reason: 'unsubscribe' })
  await recordEvent(db, { contactId: contact.id, messageId: message.id, type: 'unsubscribe', data: { via } })
  return true
}
