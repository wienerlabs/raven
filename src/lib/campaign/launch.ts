import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { campaigns, contacts, messages, pitches, suppressions, type CampaignConfig } from '@/lib/db/schema'
import { activeSenders } from '@/lib/channels/email'
import { whatsappMode, type SenderConfig } from '@/lib/env'
import { randomToken } from '@/lib/security/tokens'
import { defaultCampaignConfig, localDayKey, nextWindowStart, planSlots } from './schedule'

export async function ensureCampaign(db: Database) {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(1)
  if (rows[0]) return rows[0]
  const inserted = await db.insert(campaigns).values({ name: 'Ana kampanya', status: 'draft', config: defaultCampaignConfig }).returning()
  return inserted[0]
}

export async function updateCampaignConfig(db: Database, campaignId: string, config: CampaignConfig) {
  await db.update(campaigns).set({ config, updatedAt: new Date() }).where(eq(campaigns.id, campaignId))
}

export interface LaunchSummary {
  queuedEmail: number
  queuedWhatsapp: number
  manualWhatsapp: number
  skipped: number
  firstAt: Date | null
  lastAt: Date | null
}

async function usageByDay(db: Database, senders: SenderConfig[], config: CampaignConfig, now: Date): Promise<Record<string, Record<string, number>>> {
  const rows = await db
    .select({ senderId: messages.senderId, scheduledAt: messages.scheduledAt, sentAt: messages.sentAt })
    .from(messages)
    .where(
      and(
        eq(messages.channel, 'email'),
        eq(messages.isTest, false),
        inArray(messages.status, ['scheduled', 'sending', 'sent']),
        inArray(
          messages.senderId,
          senders.map((sender) => sender.id),
        ),
        sql`coalesce(${messages.sentAt}, ${messages.scheduledAt}) >= ${new Date(now.getTime() - 36 * 3600 * 1000).toISOString()}::timestamptz`,
      ),
    )
  const usage: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const at = row.sentAt ?? row.scheduledAt
    if (!row.senderId || !at) continue
    const key = localDayKey(at, config.timezone)
    usage[row.senderId] ??= {}
    usage[row.senderId][key] = (usage[row.senderId][key] ?? 0) + 1
  }
  return usage
}

export async function launchCampaign(
  db: Database,
  campaignId: string,
  options: { now?: Date; senders?: SenderConfig[]; contactIds?: string[]; random?: () => number } = {},
): Promise<LaunchSummary> {
  const now = options.now ?? new Date()
  const random = options.random ?? Math.random
  const senders = options.senders ?? activeSenders()
  const campaignRows = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1)
  const campaign = campaignRows[0]
  if (!campaign) throw new Error('Campaign not found')
  const config = campaign.config
  const filters = [eq(contacts.reviewStatus, 'approved'), eq(contacts.stage, 'new')]
  if (options.contactIds?.length) filters.push(inArray(contacts.id, options.contactIds))
  const candidates = await db
    .select({ id: contacts.id, email: contacts.email, phone: contacts.phone, domain: contacts.domain, emailStatus: contacts.emailStatus, relationship: contacts.relationship, whatsappOptIn: contacts.whatsappOptIn })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(...filters))
    .orderBy(asc(contacts.createdAt))
  const alreadyQueued = candidates.length
    ? await db
        .select({ contactId: messages.contactId })
        .from(messages)
        .where(and(eq(messages.campaignId, campaignId), eq(messages.step, 0), inArray(messages.contactId, candidates.map((candidate) => candidate.id))))
    : []
  const queuedSet = new Set(alreadyQueued.map((row) => row.contactId))
  const keys = candidates.flatMap((candidate) => [candidate.email, candidate.phone, candidate.domain].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))
  const suppressedRows = keys.length ? await db.select({ value: suppressions.value }).from(suppressions).where(inArray(suppressions.value, keys)) : []
  const suppressed = new Set(suppressedRows.map((row) => row.value))
  let skipped = 0
  const emailContacts: typeof candidates = []
  const whatsappContacts: typeof candidates = []
  for (const candidate of candidates) {
    const blocked = [candidate.email, candidate.phone, candidate.domain].some((value) => value && suppressed.has(value.toLowerCase()))
    if (queuedSet.has(candidate.id) || blocked) {
      skipped += 1
      continue
    }
    if (candidate.email) emailContacts.push(candidate)
    else if (candidate.phone) whatsappContacts.push(candidate)
    else skipped += 1
  }
  const priority = (candidate: (typeof candidates)[number]) => (candidate.relationship === 'customer' ? 0 : candidate.emailStatus?.toLowerCase() === 'verified' ? 1 : 2)
  emailContacts.sort((a, b) => priority(a) - priority(b))
  const usage = await usageByDay(db, senders, config, now)
  const slots = planSlots({
    count: emailContacts.length,
    senders: senders.map((sender) => ({ id: sender.id, dailyLimit: sender.dailyLimit, usedByDay: usage[sender.id] })),
    start: now,
    config,
    random,
  })
  const rows: Array<typeof messages.$inferInsert> = emailContacts.map((candidate, index) => ({
    token: randomToken(16),
    campaignId,
    contactId: candidate.id,
    channel: 'email',
    step: 0,
    variant: config.subjectTest && index % 2 === 1 ? 'b' : 'a',
    senderId: slots[index]?.senderId ?? senders[0]?.id ?? null,
    status: 'scheduled',
    scheduledAt: slots[index]?.at ?? nextWindowStart(now, config),
  }))
  const cloud = whatsappMode() === 'cloud'
  let whatsappCursor = nextWindowStart(now, config)
  let queuedWhatsapp = 0
  let manualWhatsapp = 0
  for (const candidate of whatsappContacts) {
    const automatic = cloud && candidate.whatsappOptIn
    rows.push({
      token: randomToken(16),
      campaignId,
      contactId: candidate.id,
      channel: 'whatsapp',
      step: 0,
      status: automatic ? 'scheduled' : 'manual',
      scheduledAt: automatic ? whatsappCursor : null,
    })
    if (automatic) {
      queuedWhatsapp += 1
      whatsappCursor = nextWindowStart(new Date(whatsappCursor.getTime() + (config.minGapSeconds + random() * (config.maxGapSeconds - config.minGapSeconds)) * 1000), config)
    } else manualWhatsapp += 1
  }
  if (rows.length > 0) {
    for (let index = 0; index < rows.length; index += 200) await db.insert(messages).values(rows.slice(index, index + 200))
    await db
      .update(contacts)
      .set({ stage: 'queued', updatedAt: now })
      .where(inArray(contacts.id, rows.map((row) => row.contactId)))
  }
  await db
    .update(campaigns)
    .set({ status: 'running', pauseReason: null, launchedAt: campaign.launchedAt ?? now, updatedAt: now })
    .where(eq(campaigns.id, campaignId))
  const times = slots.map((slot) => slot.at.getTime())
  return {
    queuedEmail: emailContacts.length,
    queuedWhatsapp,
    manualWhatsapp,
    skipped,
    firstAt: times.length ? new Date(Math.min(...times)) : null,
    lastAt: times.length ? new Date(Math.max(...times)) : null,
  }
}

export async function setCampaignStatus(db: Database, campaignId: string, status: 'running' | 'paused' | 'completed', reason: string | null = null) {
  await db.update(campaigns).set({ status, pauseReason: reason, updatedAt: new Date(), completedAt: status === 'completed' ? new Date() : null }).where(eq(campaigns.id, campaignId))
}

export async function cancelCampaignQueue(db: Database, campaignId: string): Promise<number> {
  const rows = await db
    .update(messages)
    .set({ status: 'cancelled', lastError: 'campaign queue cleared', updatedAt: new Date() })
    .where(and(eq(messages.campaignId, campaignId), inArray(messages.status, ['scheduled', 'manual'])))
    .returning({ contactId: messages.contactId, step: messages.step })
  const initial = rows.filter((row) => row.step === 0).map((row) => row.contactId)
  if (initial.length) await db.update(contacts).set({ stage: 'new', updatedAt: new Date() }).where(and(inArray(contacts.id, initial), eq(contacts.stage, 'queued')))
  return rows.length
}

export async function queueTestEmail(db: Database, contactId: string, recipient: string, step = 0): Promise<{ id: string; token: string }> {
  const token = randomToken(16)
  const sender = activeSenders()[0]
  const inserted = await db.insert(messages).values({
    token,
    campaignId: null,
    contactId,
    channel: 'email',
    step,
    variant: 'a',
    senderId: sender?.id ?? null,
    status: 'scheduled',
    isTest: true,
    testRecipient: recipient,
    scheduledAt: new Date(Date.now() - 1000),
  }).returning({ id: messages.id })
  return { id: inserted[0].id, token }
}

export async function nextScheduled(db: Database, campaignId: string): Promise<Date | null> {
  const rows = await db
    .select({ at: messages.scheduledAt })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, 'scheduled'), isNotNull(messages.scheduledAt)))
    .orderBy(asc(messages.scheduledAt))
    .limit(1)
  return rows[0]?.at ?? null
}
