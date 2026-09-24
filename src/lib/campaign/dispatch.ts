import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { campaigns, contacts, events, messages, pitches, type CampaignConfig } from '@/lib/db/schema'
import { activeSenders, getTransport, senderDomain, type EmailTransport } from '@/lib/channels/email'
import { sendWhatsappTemplate, type TemplateSend, type WhatsappSendResult } from '@/lib/channels/whatsapp'
import { resolveWhatsapp } from '@/lib/whatsapp/config'
import { renderEmail } from '@/lib/email/render'
import { baseUrl as resolveBaseUrl, type SenderConfig } from '@/lib/env'
import { getSettings, type AppSettings } from '@/lib/settings'
import { randomToken } from '@/lib/security/tokens'
import { addBusinessDays, defaultCampaignConfig, inWindow, localParts, nextWindowStart } from './schedule'
import { acquireLease, releaseLease } from './lease'
import { advanceStage, cancelPending, isSuppressed, recordEvent, stoppedStages, suppress } from './state'

export interface DispatchOptions {
  now?: Date
  limit?: number
  transport?: EmailTransport
  senders?: SenderConfig[]
  baseUrl?: string
  whatsappSend?: (input: TemplateSend) => Promise<WhatsappSendResult>
  random?: () => number
  messageIds?: string[]
}

export interface DispatchReport {
  busy: boolean
  claimed: number
  sent: number
  failed: number
  rescheduled: number
  cancelled: number
  paused: string[]
  errors: string[]
}

type MessageRow = typeof messages.$inferSelect
const STUCK_AFTER_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 3
const LEASE_MS = 110_000
const UNCERTAIN = 'teslim durumu belirsiz: mesaj alıcıya ulaşmış olabilir, gönderilmiş kutusunu kontrol etmeden tekrar göndermeyin'

export async function recoverStuck(db: Database, now: Date): Promise<number> {
  const rows = await db
    .update(messages)
    .set({ status: 'failed', lastError: 'interrupted while sending, check the mailbox before retrying', updatedAt: now })
    .where(and(eq(messages.status, 'sending'), lt(messages.updatedAt, new Date(now.getTime() - STUCK_AFTER_MS))))
    .returning({ id: messages.id })
  return rows.length
}

export async function claimDue(db: Database, now: Date, limit: number, messageIds?: string[]): Promise<MessageRow[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: messages.id })
      .from(messages)
      .leftJoin(campaigns, eq(campaigns.id, messages.campaignId))
      .where(
        and(
          eq(messages.status, 'scheduled'),
          lte(messages.scheduledAt, now),
          or(isNull(messages.campaignId), eq(campaigns.status, 'running')),
          messageIds?.length ? inArray(messages.id, messageIds) : undefined,
        ),
      )
      .orderBy(asc(messages.scheduledAt))
      .limit(limit)
      .for('update', { of: messages, skipLocked: true })
    if (rows.length === 0) return []
    return tx
      .update(messages)
      .set({ status: 'sending', attempts: sql`${messages.attempts} + 1`, updatedAt: now })
      .where(inArray(messages.id, rows.map((row) => row.id)))
      .returning()
  })
}

function localDayStart(now: Date, timezone: string): Date {
  const parts = localParts(now, timezone)
  return new Date(now.getTime() - (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 - now.getUTCMilliseconds())
}

async function sentTodayBySender(db: Database, senderId: string, now: Date, timezone: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.senderId, senderId), eq(messages.status, 'sent'), eq(messages.isTest, false), gte(messages.sentAt, localDayStart(now, timezone))))
  return rows[0]?.count ?? 0
}

async function reschedule(db: Database, message: MessageRow, at: Date, reason: string): Promise<void> {
  await db.update(messages).set({ status: 'scheduled', scheduledAt: at, lastError: reason, updatedAt: new Date() }).where(eq(messages.id, message.id))
}

async function cancel(db: Database, message: MessageRow, reason: string): Promise<void> {
  await db.update(messages).set({ status: 'cancelled', lastError: reason, updatedAt: new Date() }).where(eq(messages.id, message.id))
}

async function scheduleNextStep(db: Pick<Database, 'insert'>, message: MessageRow, config: CampaignConfig, sentAt: Date, random: () => number): Promise<void> {
  if (!config.followUpsEnabled || message.isTest || !message.campaignId) return
  const gap = config.followUpDays[message.step]
  if (gap === undefined) return
  const base = addBusinessDays(sentAt, gap, config)
  const jitter = Math.floor(random() * 90) * 60 * 1000
  const at = nextWindowStart(new Date(base.getTime() + jitter), config)
  await db
    .insert(messages)
    .values({
      token: randomToken(16),
      campaignId: message.campaignId,
      contactId: message.contactId,
      channel: 'email',
      step: message.step + 1,
      variant: message.variant,
      senderId: message.senderId,
      status: 'scheduled',
      scheduledAt: at,
    })
    .onConflictDoNothing()
}

async function markSent(
  db: Database,
  message: MessageRow,
  values: { providerId: string | null; subject?: string | null; rfcMessageId?: string | null; senderId?: string | null },
  context: { now: Date; config: CampaignConfig; random: () => number; followUp: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [locked] = await tx.select({ stage: contacts.stage }).from(contacts).where(eq(contacts.id, message.contactId)).for('update')
    await tx
      .update(messages)
      .set({ status: 'sent', sentAt: context.now, providerId: values.providerId, subject: values.subject ?? message.subject, rfcMessageId: values.rfcMessageId ?? message.rfcMessageId, senderId: values.senderId ?? message.senderId, lastError: null, updatedAt: context.now })
      .where(eq(messages.id, message.id))
    if (message.isTest || !locked) return
    const next = advanceStage(locked.stage, 'contacted')
    if (next !== locked.stage) await tx.update(contacts).set({ stage: next, updatedAt: context.now }).where(eq(contacts.id, message.contactId))
    if (context.followUp && !stoppedStages.includes(next)) await scheduleNextStep(tx, message, context.config, context.now, context.random)
  })
}

async function threadInfo(db: Database, message: MessageRow): Promise<{ firstSubject: string | null; references: string[] }> {
  if (message.step === 0 || !message.campaignId) return { firstSubject: null, references: [] }
  const rows = await db
    .select({ step: messages.step, subject: messages.subject, rfc: messages.rfcMessageId })
    .from(messages)
    .where(and(eq(messages.contactId, message.contactId), eq(messages.campaignId, message.campaignId), eq(messages.status, 'sent'), lt(messages.step, message.step)))
    .orderBy(asc(messages.step))
  return { firstSubject: rows.find((row) => row.step === 0)?.subject ?? null, references: rows.map((row) => row.rfc).filter((value): value is string => Boolean(value)) }
}

export async function dispatchDue(db: Database, options: DispatchOptions = {}): Promise<DispatchReport> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const transport = options.transport ?? getTransport()
  const senders = options.senders ?? activeSenders()
  const base = options.baseUrl ?? resolveBaseUrl()
  const report: DispatchReport = { busy: false, claimed: 0, sent: 0, failed: 0, rescheduled: 0, cancelled: 0, paused: [], errors: [] }
  const lease = await acquireLease(db, 'dispatch', LEASE_MS, now)
  if (!lease) return { ...report, busy: true }
  try {
    await runDispatch(db, options, report, { now, random, transport, senders, base })
  } finally {
    await releaseLease(db, 'dispatch', lease)
  }
  return report
}

async function runDispatch(
  db: Database,
  options: DispatchOptions,
  report: DispatchReport,
  shared: { now: Date; random: () => number; transport: EmailTransport; senders: SenderConfig[]; base: string },
): Promise<void> {
  const { now, random, transport, senders, base } = shared
  await recoverStuck(db, now)
  const claimed = await claimDue(db, now, options.limit ?? 10, options.messageIds)
  report.claimed = claimed.length
  if (claimed.length === 0) return
  const settings = await getSettings(db)
  const whatsapp = await resolveWhatsapp(db)
  const whatsappSend = options.whatsappSend ?? ((input: TemplateSend) => sendWhatsappTemplate(whatsapp.cloud, input))
  const campaignIds = [...new Set(claimed.map((message) => message.campaignId).filter((id): id is string => Boolean(id)))]
  const campaignRows = campaignIds.length ? await db.select().from(campaigns).where(inArray(campaigns.id, campaignIds)) : []
  const configs = new Map(campaignRows.map((row) => [row.id, row.config]))
  for (const message of claimed) {
    try {
      const outcome = await processMessage(db, message, {
        now,
        random,
        transport,
        senders,
        base,
        settings,
        whatsappSend,
        whatsappNumber: whatsapp.businessNumber,
        config: (message.campaignId && configs.get(message.campaignId)) || defaultCampaignConfig,
      })
      report[outcome.kind] += 1
      if (outcome.error) report.errors.push(outcome.error)
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      report.errors.push(text)
      report.failed += 1
      await db.update(messages).set({ status: 'failed', lastError: text, updatedAt: new Date() }).where(eq(messages.id, message.id))
    }
  }
  report.paused = await applyBounceGuard(db, campaignIds)
}

interface ProcessContext {
  now: Date
  random: () => number
  transport: EmailTransport
  senders: SenderConfig[]
  base: string
  settings: AppSettings
  whatsappSend: (input: TemplateSend) => Promise<WhatsappSendResult>
  whatsappNumber: string | null
  config: CampaignConfig
}

type Outcome = { kind: 'sent' | 'failed' | 'rescheduled' | 'cancelled'; error?: string }

async function processMessage(db: Database, message: MessageRow, context: ProcessContext): Promise<Outcome> {
  const { now, config } = context
  const contactRows = await db.select().from(contacts).where(eq(contacts.id, message.contactId)).limit(1)
  const contact = contactRows[0]
  const pitchRows = await db.select().from(pitches).where(eq(pitches.contactId, message.contactId)).limit(1)
  const pitch = pitchRows[0]?.content
  if (!contact || !pitch) {
    await cancel(db, message, 'contact or pitch missing')
    return { kind: 'cancelled' }
  }
  if (!message.isTest) {
    if (contact.reviewStatus !== 'approved') {
      await cancel(db, message, `contact is ${contact.reviewStatus}`)
      return { kind: 'cancelled' }
    }
    if (stoppedStages.includes(contact.stage)) {
      await cancel(db, message, `contact stage ${contact.stage}`)
      return { kind: 'cancelled' }
    }
    const suppressed = await isSuppressed(db, message.channel === 'email' ? [contact.email, contact.domain] : [contact.phone])
    if (suppressed) {
      await cancel(db, message, `suppressed: ${suppressed}`)
      return { kind: 'cancelled' }
    }
    if (message.campaignId && !inWindow(now, config)) {
      await reschedule(db, message, nextWindowStart(now, config), 'outside sending window')
      return { kind: 'rescheduled' }
    }
  }
  if (message.channel === 'whatsapp') return sendWhatsapp(db, message, contact, pitch, context)

  const sender = context.senders.find((item) => item.id === message.senderId) ?? context.senders[0]
  if (!sender) {
    await db.update(messages).set({ status: 'failed', lastError: 'no sender configured', updatedAt: now }).where(eq(messages.id, message.id))
    return { kind: 'failed', error: 'no sender configured' }
  }
  if (!message.isTest && message.campaignId) {
    const limit = Math.min(sender.dailyLimit, config.dailyLimitPerSender)
    const used = await sentTodayBySender(db, sender.id, now, config.timezone)
    if (used >= limit) {
      const nextDay = nextWindowStart(new Date(localDayStart(now, config.timezone).getTime() + 24 * 3600 * 1000), config)
      await reschedule(db, message, new Date(nextDay.getTime() + Math.floor(context.random() * 45) * 60 * 1000), 'daily limit reached')
      return { kind: 'rescheduled' }
    }
  }
  const recipient = message.isTest ? message.testRecipient : contact.email
  if (!recipient) {
    await cancel(db, message, 'no email address')
    return { kind: 'cancelled' }
  }
  const thread = await threadInfo(db, message)
  const replyTo = sender.replyTo ?? sender.email
  const rendered = renderEmail({
    pitch,
    contact: { slug: contact.slug, company: contact.company },
    message: { token: message.token, step: message.step, variant: message.variant },
    settings: context.settings,
    baseUrl: context.base,
    replyTo,
    firstSubject: thread.firstSubject,
    whatsappNumber: context.whatsappNumber,
  })
  const rfcMessageId = `<${message.token}@${senderDomain(sender)}>`
  const subject = message.isTest ? `Test: ${rendered.subject}` : rendered.subject
  const result = await context.transport.send(
    {
      to: recipient,
      replyTo,
      subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      messageId: rfcMessageId,
      inReplyTo: thread.references[thread.references.length - 1],
      references: thread.references,
    },
    sender,
  )
  if (!result.error) {
    await markSent(db, message, { providerId: result.providerId, subject: rendered.subject, rfcMessageId, senderId: sender.id }, { now, config, random: context.random, followUp: true })
    await recordEvent(db, { contactId: contact.id, messageId: message.id, type: message.isTest ? 'test_sent' : 'sent', data: { step: message.step, variant: message.variant, sender: sender.id, provider: context.transport.kind }, at: now })
    return { kind: 'sent' }
  }
  if (result.permanentFailure) {
    await db.update(messages).set({ status: 'failed', lastError: result.error, updatedAt: now }).where(eq(messages.id, message.id))
    if (!message.isTest && contact.email) {
      await recordEvent(db, { contactId: contact.id, messageId: message.id, type: 'bounce', data: { reason: result.error, stage: 'smtp' }, at: now })
      await suppress(db, { contactId: contact.id, value: contact.email, kind: 'email', reason: 'bounce' })
    }
    return { kind: 'failed', error: result.error }
  }
  if (result.retryable && message.attempts < MAX_ATTEMPTS) {
    await reschedule(db, message, new Date(now.getTime() + message.attempts * 10 * 60 * 1000), result.error)
    return { kind: 'rescheduled', error: result.error }
  }
  const reason = result.retryable ? result.error : `${result.error} (${UNCERTAIN})`
  await db.update(messages).set({ status: 'failed', lastError: reason, updatedAt: now }).where(eq(messages.id, message.id))
  return { kind: 'failed', error: reason }
}

async function sendWhatsapp(
  db: Database,
  message: MessageRow,
  contact: typeof contacts.$inferSelect,
  pitch: NonNullable<(typeof pitches.$inferSelect)['content']>,
  context: ProcessContext,
): Promise<Outcome> {
  const { now } = context
  if (!contact.phone || (!contact.whatsappOptIn && !message.isTest)) {
    await db.update(messages).set({ status: 'manual', lastError: 'no WhatsApp opt-in, send manually', updatedAt: now }).where(eq(messages.id, message.id))
    return { kind: 'rescheduled' }
  }
  const result = await context.whatsappSend({
    to: contact.phone,
    greetingName: pitch.person.greetingName,
    company: pitch.company.name,
    solution: pitch.solution.name,
    buttonSuffix: `${contact.slug}?m=${message.token}&s=wa`,
    language: pitch.language,
  })
  if (!result.error) {
    await markSent(db, message, { providerId: result.providerId }, { now, config: context.config, random: context.random, followUp: false })
    await recordEvent(db, { contactId: contact.id, messageId: message.id, type: 'wa_sent', data: { mode: 'cloud' }, at: now })
    return { kind: 'sent' }
  }
  if (result.retryable && message.attempts < MAX_ATTEMPTS) {
    await reschedule(db, message, new Date(now.getTime() + message.attempts * 10 * 60 * 1000), result.error)
    return { kind: 'rescheduled', error: result.error }
  }
  await db.update(messages).set({ status: 'failed', lastError: result.error, updatedAt: now }).where(eq(messages.id, message.id))
  return { kind: 'failed', error: result.error }
}

export async function campaignBounceRate(db: Database, campaignId: string): Promise<{ sent: number; bounced: number }> {
  const sentRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, 'sent'), eq(messages.step, 0), eq(messages.channel, 'email'), eq(messages.isTest, false)))
  const bounceRows = await db
    .select({ count: sql<number>`count(distinct ${events.contactId})::int` })
    .from(events)
    .innerJoin(messages, eq(messages.id, events.messageId))
    .where(and(eq(messages.campaignId, campaignId), eq(events.type, 'bounce')))
  return { sent: sentRows[0]?.count ?? 0, bounced: bounceRows[0]?.count ?? 0 }
}

export async function applyBounceGuard(db: Database, campaignIds: string[]): Promise<string[]> {
  const paused: string[] = []
  for (const id of campaignIds) {
    const rows = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1)
    const campaign = rows[0]
    if (!campaign || campaign.status !== 'running') continue
    const { sent, bounced } = await campaignBounceRate(db, id)
    if (sent >= campaign.config.bounceGuardMinSent && bounced / sent > campaign.config.bounceGuardMaxRate) {
      await db
        .update(campaigns)
        .set({ status: 'paused', pauseReason: `Geri dönme oranı yüksek: ${bounced}/${sent}. Alan adı itibarını korumak için kampanya durduruldu.`, updatedAt: new Date() })
        .where(eq(campaigns.id, id))
      paused.push(id)
    }
  }
  return paused
}

export { cancelPending }
