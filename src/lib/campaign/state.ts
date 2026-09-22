import { and, eq, inArray, or } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, events, messages, responses, suppressions, type Intent, type Stage } from '@/lib/db/schema'

export const stageRank: Record<Stage, number> = {
  new: 0,
  queued: 1,
  contacted: 2,
  engaged: 3,
  declined: 4,
  replied: 5,
  meeting: 6,
  unsubscribed: 7,
  bounced: 7,
}

export const stoppedStages: Stage[] = ['replied', 'meeting', 'declined', 'unsubscribed', 'bounced']

export function advanceStage(current: Stage, next: Stage): Stage {
  return stageRank[next] > stageRank[current] ? next : current
}

export async function recordEvent(
  db: Database,
  input: { contactId: string | null; messageId?: string | null; type: string; data?: Record<string, unknown>; at?: Date },
): Promise<void> {
  const at = input.at ?? new Date()
  await db.insert(events).values({ contactId: input.contactId, messageId: input.messageId ?? null, type: input.type, data: input.data ?? {}, createdAt: at })
  if (input.contactId) await db.update(contacts).set({ lastActivityAt: at }).where(eq(contacts.id, input.contactId))
}

export async function moveStage(db: Database, contactId: string, next: Stage): Promise<Stage> {
  const rows = await db.select({ stage: contacts.stage }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
  const current = rows[0]?.stage
  if (!current) return next
  const target = advanceStage(current, next)
  if (target !== current) await db.update(contacts).set({ stage: target, updatedAt: new Date() }).where(eq(contacts.id, contactId))
  return target
}

export async function cancelPending(db: Database, contactId: string, reason: string): Promise<number> {
  const cancelled = await db
    .update(messages)
    .set({ status: 'cancelled', lastError: reason, updatedAt: new Date() })
    .where(and(eq(messages.contactId, contactId), inArray(messages.status, ['scheduled', 'manual']), eq(messages.isTest, false)))
    .returning({ id: messages.id })
  return cancelled.length
}

export async function isSuppressed(db: Database, values: Array<string | null | undefined>): Promise<string | null> {
  const keys = values.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase())
  if (keys.length === 0) return null
  const rows = await db.select().from(suppressions).where(inArray(suppressions.value, keys)).limit(1)
  return rows[0]?.reason ?? null
}

export async function suppress(
  db: Database,
  input: { contactId?: string | null; value: string; kind: 'email' | 'phone' | 'domain'; reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual' | 'stop' },
): Promise<void> {
  await db.insert(suppressions).values({ value: input.value.toLowerCase(), kind: input.kind, reason: input.reason }).onConflictDoNothing()
  if (!input.contactId) return
  const stage: Stage = input.reason === 'bounce' ? 'bounced' : 'unsubscribed'
  await db.update(contacts).set({ stage, updatedAt: new Date() }).where(eq(contacts.id, input.contactId))
  await cancelPending(db, input.contactId, `suppressed: ${input.reason}`)
}

export function intentStage(intent: Intent, kind: 'intent' | 'form' | 'reply' | 'auto_reply'): Stage | null {
  if (kind === 'auto_reply') return null
  if (intent === 'meeting') return 'meeting'
  if (intent === 'later' || intent === 'not_interested') return 'declined'
  return 'replied'
}

export async function recordResponse(
  db: Database,
  input: {
    contactId: string
    messageId?: string | null
    channel: 'email' | 'whatsapp' | 'landing'
    kind: 'intent' | 'form' | 'reply' | 'auto_reply'
    intent: Intent
    body?: string | null
    fromAddress?: string | null
    at?: Date
  },
): Promise<{ id: string; duplicate: boolean }> {
  const at = input.at ?? new Date()
  if (input.kind === 'intent') {
    const existing = await db
      .select({ id: responses.id })
      .from(responses)
      .where(and(eq(responses.contactId, input.contactId), eq(responses.kind, 'intent'), eq(responses.intent, input.intent)))
      .limit(1)
    if (existing[0]) return { id: existing[0].id, duplicate: true }
  }
  const inserted = await db
    .insert(responses)
    .values({
      contactId: input.contactId,
      messageId: input.messageId ?? null,
      channel: input.channel,
      kind: input.kind,
      intent: input.intent,
      body: input.body?.slice(0, 4000) ?? null,
      fromAddress: input.fromAddress ?? null,
      createdAt: at,
    })
    .returning({ id: responses.id })
  await recordEvent(db, { contactId: input.contactId, messageId: input.messageId, type: input.kind === 'auto_reply' ? 'auto_reply' : 'response', data: { intent: input.intent, channel: input.channel, kind: input.kind }, at })
  const stage = intentStage(input.intent, input.kind)
  if (stage) {
    await moveStage(db, input.contactId, stage)
    await cancelPending(db, input.contactId, `stopped: ${input.kind} ${input.intent}`)
  }
  return { id: inserted[0].id, duplicate: false }
}

export async function findMessageByToken(db: Database, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const rows = await db.select().from(messages).where(eq(messages.token, token)).limit(1)
  return rows[0] ?? null
}

export async function findContactByAddress(db: Database, address: string) {
  const value = address.trim().toLowerCase()
  const rows = await db
    .select()
    .from(contacts)
    .where(or(eq(contacts.email, value), eq(contacts.phone, value)))
    .limit(1)
  return rows[0] ?? null
}
