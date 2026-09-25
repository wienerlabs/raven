import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, events, messages, pitches, responses, type Stage } from '@/lib/db/schema'
import { baseUrl } from '@/lib/env'
import { renderWhatsapp } from '@/lib/email/render'
import { buildLinks } from '@/lib/email/links'
import { templateText } from '@/lib/channels/whatsapp'
import { REPLY_WINDOW_MS } from './inbound'
import { threadMatches } from './format'

export type InboxFilter = 'all' | 'waiting' | 'unverified'

export interface InboxThread {
  contactId: string
  name: string
  company: string
  from: string | null
  verified: boolean
  unhandled: number
  lastInboundAt: Date
  lastActivityAt: Date
  lastMessage: { direction: 'in' | 'out'; text: string; at: Date }
  windowClosesAt: Date
}

export interface InboxCounts {
  all: number
  waiting: number
  unverified: number
}

export async function whatsappInbox(db: Database, options: { filter?: InboxFilter; search?: string } = {}): Promise<{ threads: InboxThread[]; counts: InboxCounts }> {
  const inbound = await db
    .select({ body: responses.body, at: responses.createdAt, from: responses.fromAddress, handled: responses.handled, contactId: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, company: contacts.company, phone: contacts.phone })
    .from(responses)
    .innerJoin(contacts, eq(contacts.id, responses.contactId))
    .where(and(eq(responses.channel, 'whatsapp'), eq(responses.kind, 'reply')))
    .orderBy(desc(responses.createdAt))
    .limit(2000)
  const byContact = new Map<string, InboxThread>()
  for (const row of inbound) {
    const existing = byContact.get(row.contactId)
    if (!existing) {
      byContact.set(row.contactId, {
        contactId: row.contactId,
        name: `${row.firstName} ${row.lastName}`.trim(),
        company: row.company,
        from: row.from,
        verified: Boolean(row.from && row.from === row.phone),
        unhandled: row.handled ? 0 : 1,
        lastInboundAt: row.at,
        lastActivityAt: row.at,
        lastMessage: { direction: 'in', text: row.body ?? '', at: row.at },
        windowClosesAt: new Date(row.at.getTime() + REPLY_WINDOW_MS),
      })
      continue
    }
    if (!row.handled) existing.unhandled += 1
  }
  const contactIds = [...byContact.keys()]
  if (contactIds.length) {
    const replies = await db
      .select({ contactId: events.contactId, data: events.data, at: events.createdAt })
      .from(events)
      .where(and(eq(events.type, 'wa_reply'), inArray(events.contactId, contactIds)))
      .orderBy(desc(events.createdAt))
    for (const reply of replies) {
      const thread = reply.contactId ? byContact.get(reply.contactId) : undefined
      if (!thread || reply.at <= thread.lastActivityAt) continue
      thread.lastActivityAt = reply.at
      thread.lastMessage = { direction: 'out', text: typeof reply.data.text === 'string' ? reply.data.text : '', at: reply.at }
    }
  }
  const all = [...byContact.values()].sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
  const counts: InboxCounts = { all: all.length, waiting: all.filter((thread) => thread.unhandled > 0).length, unverified: all.filter((thread) => !thread.verified).length }
  const filter = options.filter ?? 'all'
  const search = options.search?.trim() ?? ''
  const threads = all.filter((thread) => (filter === 'waiting' ? thread.unhandled > 0 : filter === 'unverified' ? !thread.verified : true)).filter((thread) => (search ? threadMatches(thread, search) : true))
  return { threads, counts }
}

export interface ThreadMessage {
  id: string
  direction: 'in' | 'out'
  kind: 'reply' | 'first-touch'
  text: string
  at: Date
  via: 'whatsapp' | 'cloud' | 'manual' | 'template'
  token?: string
}

export interface ThreadDetail {
  contact: {
    id: string
    firstName: string
    lastName: string
    title: string | null
    company: string
    email: string | null
    phone: string | null
    stage: Stage
    slug: string
    language: 'tr' | 'en'
    notes: string | null
  }
  pitch: { greetingName: string; solutionName: string; tagline: string; language: 'tr' | 'en' } | null
  messages: ThreadMessage[]
  from: string | null
  verified: boolean
  lastInboundAt: Date | null
  unhandled: number
}

export async function whatsappThread(db: Database, contactId: string, base = baseUrl()): Promise<ThreadDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return null
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return null
  const [pitchRow] = await db.select({ content: pitches.content }).from(pitches).where(eq(pitches.contactId, contactId)).limit(1)
  const inbound = await db
    .select({ id: responses.id, body: responses.body, at: responses.createdAt, from: responses.fromAddress, handled: responses.handled })
    .from(responses)
    .where(and(eq(responses.contactId, contactId), eq(responses.channel, 'whatsapp'), eq(responses.kind, 'reply')))
    .orderBy(asc(responses.createdAt))
  const replies = await db
    .select({ id: events.id, data: events.data, at: events.createdAt })
    .from(events)
    .where(and(eq(events.contactId, contactId), eq(events.type, 'wa_reply')))
    .orderBy(asc(events.createdAt))
  const firstTouches = await db
    .select({ id: messages.id, token: messages.token, providerId: messages.providerId, sentAt: messages.sentAt })
    .from(messages)
    .where(and(eq(messages.contactId, contactId), eq(messages.channel, 'whatsapp'), eq(messages.status, 'sent'), eq(messages.isTest, false), isNotNull(messages.sentAt)))
    .orderBy(asc(messages.sentAt))
  const content = pitchRow?.content ?? null
  const touchText = (row: { token: string; providerId: string | null }): string => {
    if (!content) return 'Tanıtım mesajı gönderildi.'
    if (row.providerId) return templateText(content.language, { greetingName: content.person.greetingName, company: content.company.name, solution: content.solution.name })
    return renderWhatsapp(content, buildLinks(base, contact.slug, row.token).whatsappLanding)
  }
  const list: ThreadMessage[] = [
    ...firstTouches.map((row) => ({ id: row.id, direction: 'out' as const, kind: 'first-touch' as const, text: touchText(row), at: row.sentAt as Date, via: row.providerId ? ('template' as const) : ('manual' as const), token: row.token })),
    ...inbound.map((row) => ({ id: row.id, direction: 'in' as const, kind: 'reply' as const, text: row.body ?? '', at: row.at, via: 'whatsapp' as const })),
    ...replies.map((row) => ({ id: row.id, direction: 'out' as const, kind: 'reply' as const, text: typeof row.data.text === 'string' ? row.data.text : '', at: row.at, via: row.data.manual === true ? ('manual' as const) : ('cloud' as const) })),
  ].sort((left, right) => left.at.getTime() - right.at.getTime())
  const latest = inbound[inbound.length - 1] ?? null
  return {
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      title: contact.title,
      company: contact.company,
      email: contact.email,
      phone: contact.phone,
      stage: contact.stage,
      slug: contact.slug,
      language: contact.language,
      notes: contact.notes,
    },
    pitch: content ? { greetingName: content.person.greetingName, solutionName: content.solution.name, tagline: content.solution.tagline, language: content.language } : null,
    messages: list,
    from: latest?.from ?? null,
    verified: Boolean(latest?.from && latest.from === contact.phone),
    lastInboundAt: latest?.at ?? null,
    unhandled: inbound.filter((row) => !row.handled).length,
  }
}

export async function setThreadHandled(db: Database, contactId: string, handled: boolean, now = new Date()): Promise<void> {
  const thread = and(eq(responses.contactId, contactId), eq(responses.channel, 'whatsapp'), eq(responses.kind, 'reply'))
  if (handled) {
    await db.update(responses).set({ handled: true, handledAt: now }).where(and(thread, eq(responses.handled, false)))
    return
  }
  const [latest] = await db.select({ id: responses.id }).from(responses).where(thread).orderBy(desc(responses.createdAt)).limit(1)
  if (latest) await db.update(responses).set({ handled: false, handledAt: null }).where(eq(responses.id, latest.id))
}
