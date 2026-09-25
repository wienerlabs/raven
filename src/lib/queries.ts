import { and, asc, count, countDistinct, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { Database } from '@/lib/db'
import { campaigns, contacts, domains, events, messages, pitches, responses, type ReviewStatus, type Stage } from '@/lib/db/schema'

export async function navCounts(db: Database) {
  const [inbox] = await db.select({ value: count() }).from(responses).where(and(eq(responses.handled, false), ne(responses.kind, 'auto_reply')))
  const [whatsapp] = await db.select({ value: count() }).from(messages).where(and(eq(messages.status, 'manual'), eq(messages.channel, 'whatsapp')))
  const [conversations] = await db
    .select({ value: countDistinct(responses.contactId) })
    .from(responses)
    .where(and(eq(responses.channel, 'whatsapp'), eq(responses.kind, 'reply'), eq(responses.handled, false)))
  const [telegram] = await db
    .select({ value: countDistinct(responses.contactId) })
    .from(responses)
    .where(and(eq(responses.channel, 'telegram'), eq(responses.kind, 'reply'), eq(responses.handled, false)))
  return { inbox: inbox?.value ?? 0, whatsapp: (whatsapp?.value ?? 0) + (conversations?.value ?? 0), telegram: telegram?.value ?? 0 }
}

export async function overviewStats(db: Database) {
  const reviewRows = await db.select({ key: contacts.reviewStatus, value: count() }).from(contacts).groupBy(contacts.reviewStatus)
  const stageRows = await db.select({ key: contacts.stage, value: count() }).from(contacts).groupBy(contacts.stage)
  const review = Object.fromEntries(reviewRows.map((row) => [row.key, row.value])) as Partial<Record<ReviewStatus, number>>
  const stage = Object.fromEntries(stageRows.map((row) => [row.key, row.value])) as Partial<Record<Stage, number>>
  const total = reviewRows.reduce((sum, row) => sum + row.value, 0)
  const [withPitch] = await db.select({ value: count() }).from(pitches)
  const [sentInitial] = await db.select({ value: count() }).from(messages).where(and(eq(messages.status, 'sent'), eq(messages.step, 0), eq(messages.isTest, false)))
  const [sentFollowUps] = await db.select({ value: count() }).from(messages).where(and(eq(messages.status, 'sent'), sql`${messages.step} > 0`, eq(messages.isTest, false)))
  const [viewers] = await db.select({ value: countDistinct(events.contactId) }).from(events).where(eq(events.type, 'view'))
  const [responders] = await db.select({ value: countDistinct(responses.contactId) }).from(responses).where(ne(responses.kind, 'auto_reply'))
  const [meetings] = await db.select({ value: countDistinct(responses.contactId) }).from(responses).where(eq(responses.intent, 'meeting'))
  const variantRows = await db
    .select({ variant: messages.variant, sent: countDistinct(messages.id), replied: countDistinct(responses.contactId) })
    .from(messages)
    .leftJoin(responses, and(eq(responses.contactId, messages.contactId), ne(responses.kind, 'auto_reply')))
    .where(and(eq(messages.status, 'sent'), eq(messages.step, 0), eq(messages.isTest, false), eq(messages.channel, 'email')))
    .groupBy(messages.variant)
  return {
    total,
    review,
    stage,
    withPitch: withPitch?.value ?? 0,
    sentInitial: sentInitial?.value ?? 0,
    sentFollowUps: sentFollowUps?.value ?? 0,
    viewers: viewers?.value ?? 0,
    responders: responders?.value ?? 0,
    meetings: meetings?.value ?? 0,
    variants: variantRows,
  }
}

export async function recentResponses(db: Database, limit = 6) {
  return db
    .select({ response: responses, contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, email: contacts.email, phone: contacts.phone, slug: contacts.slug } })
    .from(responses)
    .innerJoin(contacts, eq(contacts.id, responses.contactId))
    .where(ne(responses.kind, 'auto_reply'))
    .orderBy(desc(responses.createdAt))
    .limit(limit)
}

export interface ContactFilters {
  q?: string
  review?: string
  stage?: string
  flagged?: string
  pitch?: string
  page?: number
  pageSize?: number
}

export async function listContacts(db: Database, filters: ContactFilters) {
  const conditions: SQL[] = []
  const q = filters.q?.trim()
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, '')}%`
    const match = or(ilike(contacts.firstName, pattern), ilike(contacts.lastName, pattern), ilike(contacts.company, pattern), ilike(contacts.email, pattern), ilike(contacts.title, pattern))
    if (match) conditions.push(match)
  }
  if (filters.review && ['pending', 'approved', 'hold', 'excluded'].includes(filters.review)) conditions.push(eq(contacts.reviewStatus, filters.review as ReviewStatus))
  if (filters.stage && ['new', 'queued', 'contacted', 'engaged', 'replied', 'meeting', 'declined', 'unsubscribed', 'bounced'].includes(filters.stage)) conditions.push(eq(contacts.stage, filters.stage as Stage))
  if (filters.flagged === '1') conditions.push(sql`jsonb_array_length(${contacts.flags}) > 0`)
  if (filters.pitch === 'missing') conditions.push(isNull(pitches.id))
  if (filters.pitch === 'warnings') conditions.push(sql`jsonb_array_length(${pitches.warnings}) > 0`)
  const where = conditions.length ? and(...conditions) : undefined
  const pageSize = filters.pageSize ?? 50
  const page = Math.max(1, filters.page ?? 1)
  const rows = await db
    .select({
      id: contacts.id,
      slug: contacts.slug,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      title: contacts.title,
      company: contacts.company,
      email: contacts.email,
      phone: contacts.phone,
      emailStatus: contacts.emailStatus,
      language: contacts.language,
      relationship: contacts.relationship,
      reviewStatus: contacts.reviewStatus,
      stage: contacts.stage,
      flags: contacts.flags,
      lastActivityAt: contacts.lastActivityAt,
      solution: sql<string | null>`${pitches.content}->'solution'->>'name'`,
      greeting: sql<string | null>`${pitches.content}->'person'->>'greetingName'`,
      personFirst: sql<string | null>`${pitches.content}->'person'->>'firstName'`,
      personLast: sql<string | null>`${pitches.content}->'person'->>'lastName'`,
      companyName: sql<string | null>`${pitches.content}->'company'->>'name'`,
      warnings: sql<number>`coalesce(jsonb_array_length(${pitches.warnings}), 0)`,
    })
    .from(contacts)
    .leftJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(where)
    .orderBy(asc(contacts.createdAt), asc(contacts.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
  const [total] = await db.select({ value: count() }).from(contacts).leftJoin(pitches, eq(pitches.contactId, contacts.id)).where(where)
  return { rows, total: total?.value ?? 0, page, pageSize }
}

export async function contactDetail(db: Database, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  const contact = rows[0]
  if (!contact) return null
  const [pitchRow] = await db.select().from(pitches).where(eq(pitches.contactId, id)).limit(1)
  const [research] = contact.domain ? await db.select().from(domains).where(eq(domains.domain, contact.domain)).limit(1) : []
  const messageRows = await db.select().from(messages).where(eq(messages.contactId, id)).orderBy(desc(messages.createdAt))
  const eventRows = await db.select().from(events).where(eq(events.contactId, id)).orderBy(desc(events.createdAt)).limit(60)
  const responseRows = await db.select().from(responses).where(eq(responses.contactId, id)).orderBy(desc(responses.createdAt))
  const siblings = await db.select({ id: contacts.id }).from(contacts).orderBy(asc(contacts.createdAt), asc(contacts.id))
  const index = siblings.findIndex((row) => row.id === id)
  return {
    contact,
    pitch: pitchRow ?? null,
    research: research ?? null,
    messages: messageRows,
    events: eventRows,
    responses: responseRows,
    previousId: index > 0 ? siblings[index - 1].id : null,
    nextId: index >= 0 && index < siblings.length - 1 ? siblings[index + 1].id : null,
  }
}

export async function campaignOverview(db: Database, campaignId: string) {
  const statusRows = await db
    .select({ status: messages.status, step: messages.step, channel: messages.channel, value: count() })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.isTest, false)))
    .groupBy(messages.status, messages.step, messages.channel)
  const upcoming = await db
    .select({ message: messages, contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, email: contacts.email } })
    .from(messages)
    .innerJoin(contacts, eq(contacts.id, messages.contactId))
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, 'scheduled')))
    .orderBy(asc(messages.scheduledAt))
    .limit(12)
  const recent = await db
    .select({ message: messages, contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, email: contacts.email } })
    .from(messages)
    .innerJoin(contacts, eq(contacts.id, messages.contactId))
    .where(and(eq(messages.campaignId, campaignId), inArray(messages.status, ['sent', 'failed'])))
    .orderBy(desc(sql`coalesce(${messages.sentAt}, ${messages.updatedAt})`))
    .limit(12)
  const [lastScheduled] = await db
    .select({ at: sql<Date | null>`max(${messages.scheduledAt})` })
    .from(messages)
    .where(and(eq(messages.campaignId, campaignId), eq(messages.status, 'scheduled')))
  return { statusRows, upcoming, recent, lastScheduledAt: lastScheduled?.at ? new Date(lastScheduled.at) : null }
}

export async function readyToLaunch(db: Database) {
  const [row] = await db
    .select({ value: count() })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(eq(contacts.reviewStatus, 'approved'), eq(contacts.stage, 'new')))
  return row?.value ?? 0
}

export async function latestCampaign(db: Database) {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(1)
  return rows[0] ?? null
}

export async function listResponses(db: Database, filters: { show?: string; intent?: string }) {
  const conditions: SQL[] = [ne(responses.kind, 'auto_reply')]
  if (filters.show !== 'all') conditions.push(eq(responses.handled, false))
  if (filters.intent && ['meeting', 'info', 'later', 'not_interested', 'other'].includes(filters.intent)) conditions.push(eq(responses.intent, filters.intent as 'meeting'))
  if (filters.show === 'auto') {
    conditions.splice(0, conditions.length, eq(responses.kind, 'auto_reply'))
  }
  return db
    .select({
      response: responses,
      contact: { id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title, company: contacts.company, email: contacts.email, phone: contacts.phone, slug: contacts.slug, stage: contacts.stage },
      solution: sql<string | null>`${pitches.content}->'solution'->>'name'`,
      greeting: sql<string | null>`${pitches.content}->'person'->>'greetingName'`,
    })
    .from(responses)
    .innerJoin(contacts, eq(contacts.id, responses.contactId))
    .leftJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(responses.createdAt))
    .limit(200)
}

export async function whatsappQueue(db: Database) {
  return db
    .select({ message: messages, contact: contacts, pitch: pitches.content })
    .from(messages)
    .innerJoin(contacts, eq(contacts.id, messages.contactId))
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(eq(messages.channel, 'whatsapp'), inArray(messages.status, ['manual', 'scheduled', 'sent'])))
    .orderBy(asc(messages.status), desc(messages.createdAt))
    .limit(300)
}

export async function phoneContactsWithoutWhatsapp(db: Database) {
  return db
    .select({ contact: contacts, pitch: pitches.content })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(sql`${contacts.phone} is not null`, eq(contacts.reviewStatus, 'approved'), sql`not exists (select 1 from ${messages} m where m.contact_id = ${contacts.id} and m.channel = 'whatsapp' and m.status <> 'cancelled')`))
    .orderBy(asc(contacts.createdAt))
    .limit(300)
}

export interface PulseDay {
  day: string
  sent: number
  reached: number
  views: number
  responses: number
  meetings: number
}

export function localDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function dayOf(column: AnyPgColumn, timezone: string) {
  return sql<string>`to_char(${column} at time zone ${timezone}, 'YYYY-MM-DD')`
}

export async function responsePulse(db: Database, options: { days: number; timezone: string; now?: Date }): Promise<PulseDay[]> {
  const now = options.now ?? new Date()
  const tz = options.timezone
  const since = new Date(now.getTime() - options.days * 86_400_000).toISOString()
  const [sent, reached, views, replies, meetings] = await Promise.all([
    db
      .select({ day: dayOf(messages.sentAt, tz), value: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.status, 'sent'), eq(messages.isTest, false), sql`${messages.sentAt} >= ${since}::timestamptz`))
      .groupBy(sql`1`),
    db
      .select({ day: dayOf(messages.sentAt, tz), value: sql<number>`count(distinct ${messages.contactId})::int` })
      .from(messages)
      .where(and(eq(messages.status, 'sent'), eq(messages.step, 0), eq(messages.isTest, false), sql`${messages.sentAt} >= ${since}::timestamptz`))
      .groupBy(sql`1`),
    db
      .select({ day: dayOf(events.createdAt, tz), value: sql<number>`count(distinct ${events.contactId})::int` })
      .from(events)
      .where(and(eq(events.type, 'view'), sql`${events.createdAt} >= ${since}::timestamptz`))
      .groupBy(sql`1`),
    db
      .select({ day: dayOf(responses.createdAt, tz), value: sql<number>`count(distinct ${responses.contactId})::int` })
      .from(responses)
      .where(and(ne(responses.kind, 'auto_reply'), sql`${responses.createdAt} >= ${since}::timestamptz`))
      .groupBy(sql`1`),
    db
      .select({ day: dayOf(responses.createdAt, tz), value: sql<number>`count(distinct ${responses.contactId})::int` })
      .from(responses)
      .where(and(eq(responses.intent, 'meeting'), sql`${responses.createdAt} >= ${since}::timestamptz`))
      .groupBy(sql`1`),
  ])
  const index = (rows: Array<{ day: string; value: number }>) => new Map(rows.map((row) => [row.day, Number(row.value)]))
  const maps = { sent: index(sent), reached: index(reached), views: index(views), responses: index(replies), meetings: index(meetings) }
  const out: PulseDay[] = []
  const seen = new Set<string>()
  for (let offset = options.days - 1; offset >= 0; offset--) {
    const day = localDay(new Date(now.getTime() - offset * 86_400_000), tz)
    if (seen.has(day)) continue
    seen.add(day)
    out.push({ day, sent: maps.sent.get(day) ?? 0, reached: maps.reached.get(day) ?? 0, views: maps.views.get(day) ?? 0, responses: maps.responses.get(day) ?? 0, meetings: maps.meetings.get(day) ?? 0 })
  }
  return out
}

export async function responseMix(db: Database) {
  const latest = await db
    .selectDistinctOn([responses.contactId], { contactId: responses.contactId, intent: responses.intent, at: responses.createdAt })
    .from(responses)
    .where(ne(responses.kind, 'auto_reply'))
    .orderBy(responses.contactId, desc(responses.createdAt))
  const intents = new Map<string, number>()
  for (const row of latest) intents.set(row.intent, (intents.get(row.intent) ?? 0) + 1)
  const firstSent = await db
    .select({ contactId: messages.contactId, at: sql<Date | string>`min(${messages.sentAt})` })
    .from(messages)
    .where(and(eq(messages.status, 'sent'), eq(messages.step, 0), eq(messages.isTest, false)))
    .groupBy(messages.contactId)
  const firstReply = await db
    .select({ contactId: responses.contactId, at: sql<Date | string>`min(${responses.createdAt})` })
    .from(responses)
    .where(ne(responses.kind, 'auto_reply'))
    .groupBy(responses.contactId)
  const sentAt = new Map(firstSent.map((row) => [row.contactId, new Date(row.at).getTime()]))
  const hours = firstReply
    .map((row) => {
      const start = sentAt.get(row.contactId)
      const end = new Date(row.at).getTime()
      return start && end > start ? (end - start) / 3_600_000 : null
    })
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right)
  const medianHours = hours.length ? (hours.length % 2 ? hours[(hours.length - 1) / 2] : (hours[hours.length / 2 - 1] + hours[hours.length / 2]) / 2) : null
  return { intents: Object.fromEntries(intents) as Partial<Record<'meeting' | 'info' | 'later' | 'not_interested' | 'other', number>>, responders: latest.length, medianHours }
}

export async function sectorPerformance(db: Database, limit = 6) {
  const sector = sql<string | null>`nullif(trim(${pitches.content}->'company'->>'sector'), '')`
  const rows = await db
    .select({
      sector,
      people: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) filter (where exists (select 1 from ${messages} m where m.contact_id = ${contacts.id} and m.status = 'sent' and m.is_test = false))::int`,
      responded: sql<number>`count(*) filter (where exists (select 1 from ${responses} r where r.contact_id = ${contacts.id} and r.kind <> 'auto_reply'))::int`,
    })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .groupBy(sql`1`)
  const merged = new Map<string, { sector: string; people: number; contacted: number; responded: number }>()
  for (const row of rows) {
    const name = (row.sector ?? 'Diğer').replace(/\s+/g, ' ')
    const key = name.toLocaleLowerCase('tr')
    const current = merged.get(key) ?? { sector: name, people: 0, contacted: 0, responded: 0 }
    current.people += Number(row.people)
    current.contacted += Number(row.contacted)
    current.responded += Number(row.responded)
    merged.set(key, current)
  }
  const list = [...merged.values()]
  const anySent = list.some((row) => row.contacted > 0)
  return {
    anySent,
    rows: list
      .filter((row) => !anySent || row.contacted > 0)
      .sort((left, right) => (anySent ? right.contacted - left.contacted || right.responded - left.responded : right.people - left.people))
      .slice(0, limit),
  }
}

export async function sampleSlug(db: Database): Promise<string | null> {
  const [row] = await db.select({ slug: contacts.slug }).from(contacts).innerJoin(pitches, eq(pitches.contactId, contacts.id)).orderBy(asc(contacts.createdAt)).limit(1)
  return row?.slug ?? null
}
