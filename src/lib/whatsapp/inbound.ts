import { and, desc, eq, ne } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, events, messages, responses } from '@/lib/db/schema'
import { findReference, isStopWord, type WhatsappWebhookEvent } from '@/lib/channels/whatsapp'
import { cancelPending, findContactByAddress, moveStage, recordEvent, recordResponse, suppress } from '@/lib/campaign/state'
import { classifyReplyIntent } from '@/lib/inbox/classify'
import { normalizePhone } from '@/lib/contacts/phone'

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

export interface InboundNotice {
  contactId: string
  name: string
  company: string
  text: string
  from: string
  verified: boolean
}

export interface InboundSummary {
  statuses: number
  received: number
  unverified: number
  stopped: number
  ignored: number
  duplicates: number
  notices: InboundNotice[]
}

type ContactRow = typeof contacts.$inferSelect

async function claimInbound(db: Database, input: { contactId: string; providerId: string | null; text: string; from: string; verified: boolean; at: Date }): Promise<boolean> {
  const rows = await db
    .insert(events)
    .values({ contactId: input.contactId, type: 'wa_inbound', data: { id: input.providerId, text: input.text.slice(0, 1000), from: input.from, verified: input.verified }, createdAt: input.at })
    .onConflictDoNothing()
    .returning({ id: events.id })
  return rows.length > 0
}

async function contactForReference(db: Database, reference: string | null): Promise<ContactRow | null> {
  if (!reference) return null
  const [contact] = await db.select().from(contacts).where(eq(contacts.slug, reference)).limit(1)
  return contact ?? null
}

export async function handleWhatsappEvents(db: Database, list: WhatsappWebhookEvent[], now = new Date()): Promise<InboundSummary> {
  const summary: InboundSummary = { statuses: 0, received: 0, unverified: 0, stopped: 0, ignored: 0, duplicates: 0, notices: [] }
  for (const event of list) {
    if (event.kind === 'status' && event.providerId) {
      const [message] = await db.select().from(messages).where(eq(messages.providerId, event.providerId)).limit(1)
      if (!message) continue
      const type = event.status === 'read' ? 'wa_read' : event.status === 'delivered' ? 'wa_delivered' : event.status === 'failed' ? 'wa_failed' : null
      if (type) {
        await recordEvent(db, { contactId: message.contactId, messageId: message.id, type, data: { status: event.status }, at: now })
        summary.statuses += 1
      }
      continue
    }
    if (event.kind !== 'message' || !event.from) continue
    const phone = normalizePhone(`+${event.from.replace(/\D/g, '')}`)
    if (!phone) {
      summary.ignored += 1
      continue
    }
    const known = (await findContactByAddress(db, phone)) as ContactRow | null
    const contact = known ?? (await contactForReference(db, findReference(event.text)))
    if (!contact) {
      summary.ignored += 1
      continue
    }
    const verified = Boolean(known)
    const at = event.timestamp ? new Date(event.timestamp * 1000) : now
    if (!(await claimInbound(db, { contactId: contact.id, providerId: event.providerId, text: event.text ?? '', from: phone, verified, at }))) {
      summary.duplicates += 1
      continue
    }
    if (isStopWord(event.text)) {
      await suppress(db, { contactId: verified ? contact.id : null, value: phone, kind: 'phone', reason: 'stop' })
      if (verified) await recordEvent(db, { contactId: contact.id, type: 'unsubscribe', data: { via: 'whatsapp' }, at })
      summary.stopped += 1
      continue
    }
    if (verified && !contact.whatsappOptIn) await db.update(contacts).set({ whatsappOptIn: true, updatedAt: now }).where(eq(contacts.id, contact.id))
    const text = event.text ?? ''
    await recordResponse(db, { contactId: contact.id, channel: 'whatsapp', kind: 'reply', intent: classifyReplyIntent(text), body: text || '(metin dışı mesaj)', fromAddress: phone, at, advance: verified })
    if (verified) summary.received += 1
    else summary.unverified += 1
    summary.notices.push({ contactId: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), company: contact.company, text, from: phone, verified })
  }
  return summary
}

export async function latestInbound(db: Database, contactId: string): Promise<{ at: Date; from: string | null } | null> {
  const [row] = await db
    .select({ at: responses.createdAt, from: responses.fromAddress })
    .from(responses)
    .where(and(eq(responses.contactId, contactId), eq(responses.channel, 'whatsapp'), eq(responses.kind, 'reply')))
    .orderBy(desc(responses.createdAt))
    .limit(1)
  return row ?? null
}

export function replyWindowOpen(last: Date | null, now = new Date()): boolean {
  return Boolean(last && now.getTime() - last.getTime() < REPLY_WINDOW_MS)
}

export type LinkOutcome = { ok: true; phone: string } | { ok: false; reason: 'no-message' | 'has-phone' | 'taken' }

export async function linkWhatsappSender(db: Database, contactId: string, now = new Date()): Promise<LinkOutcome> {
  const last = await latestInbound(db, contactId)
  const phone = last?.from ? normalizePhone(last.from) : null
  if (!phone) return { ok: false, reason: 'no-message' }
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return { ok: false, reason: 'no-message' }
  if (contact.phone && contact.phone !== phone) return { ok: false, reason: 'has-phone' }
  const [owner] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.phone, phone), ne(contacts.id, contactId))).limit(1)
  if (owner) return { ok: false, reason: 'taken' }
  await db.update(contacts).set({ phone, whatsappOptIn: true, updatedAt: now }).where(eq(contacts.id, contactId))
  await recordEvent(db, { contactId, type: 'wa_linked', data: { via: 'admin', phone }, at: now })
  await moveStage(db, contactId, 'replied')
  await cancelPending(db, contactId, 'stopped: whatsapp reply linked')
  return { ok: true, phone }
}
