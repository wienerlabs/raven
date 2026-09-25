import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, events, pitches, responses, telegramChats, type Stage } from '@/lib/db/schema'
import { telegramHandle } from '@/lib/channels/telegram'
import type { ChatMessage } from '@/lib/inbox/chat'
import { threadMatches } from '@/lib/whatsapp/format'
import { TELEGRAM_START_NOTE } from './copy'

export type TelegramFilter = 'all' | 'waiting'

export interface TelegramThreadSummary {
  contactId: string
  name: string
  company: string
  handle: string | null
  unhandled: number
  lastInboundAt: Date
  lastActivityAt: Date
  lastMessage: { direction: 'in' | 'out'; text: string; at: Date }
  blocked: boolean
  stopped: boolean
  moved: boolean
}

export interface TelegramCounts {
  all: number
  waiting: number
}

export async function telegramInbox(db: Database, options: { filter?: TelegramFilter; search?: string } = {}): Promise<{ threads: TelegramThreadSummary[]; counts: TelegramCounts }> {
  const inbound = await db
    .select({
      body: responses.body,
      at: responses.createdAt,
      handled: responses.handled,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      username: telegramChats.username,
      chatFirstName: telegramChats.firstName,
      chatLastName: telegramChats.lastName,
      blockedAt: telegramChats.blockedAt,
      stoppedAt: telegramChats.stoppedAt,
      owner: telegramChats.contactId,
    })
    .from(responses)
    .innerJoin(contacts, eq(contacts.id, responses.contactId))
    .leftJoin(telegramChats, eq(telegramChats.chatId, responses.fromAddress))
    .where(and(eq(responses.channel, 'telegram'), eq(responses.kind, 'reply')))
    .orderBy(desc(responses.createdAt))
    .limit(2000)
  const byContact = new Map<string, TelegramThreadSummary>()
  for (const row of inbound) {
    const existing = byContact.get(row.contactId)
    if (existing) {
      if (!row.handled) existing.unhandled += 1
      continue
    }
    const linked = row.username !== null || row.chatFirstName !== null
    byContact.set(row.contactId, {
      contactId: row.contactId,
      name: `${row.firstName} ${row.lastName}`.trim(),
      company: row.company,
      handle: linked ? telegramHandle({ username: row.username, firstName: row.chatFirstName, lastName: row.chatLastName }) : null,
      unhandled: row.handled ? 0 : 1,
      lastInboundAt: row.at,
      lastActivityAt: row.at,
      lastMessage: { direction: 'in', text: row.body ?? '', at: row.at },
      blocked: Boolean(row.blockedAt),
      stopped: Boolean(row.stoppedAt),
      moved: row.owner !== null && row.owner !== row.contactId,
    })
  }
  const contactIds = [...byContact.keys()]
  if (contactIds.length) {
    const replies = await db
      .select({ contactId: events.contactId, data: events.data, at: events.createdAt })
      .from(events)
      .where(and(eq(events.type, 'tg_reply'), inArray(events.contactId, contactIds)))
      .orderBy(desc(events.createdAt))
    for (const reply of replies) {
      const thread = reply.contactId ? byContact.get(reply.contactId) : undefined
      if (!thread || reply.at <= thread.lastActivityAt) continue
      thread.lastActivityAt = reply.at
      thread.lastMessage = { direction: 'out', text: typeof reply.data.text === 'string' ? reply.data.text : '', at: reply.at }
    }
  }
  const all = [...byContact.values()].sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime())
  const counts: TelegramCounts = { all: all.length, waiting: all.filter((thread) => thread.unhandled > 0).length }
  const search = options.search?.trim() ?? ''
  const threads = all
    .filter((thread) => (options.filter === 'waiting' ? thread.unhandled > 0 : true))
    .filter((thread) => (search ? threadMatches({ name: thread.name, company: thread.company, from: thread.handle }, search) : true))
  return { threads, counts }
}

export interface TelegramChatInfo {
  chatId: string
  handle: string
  username: string | null
  name: string
  linkedAt: Date
  blockedAt: Date | null
  stoppedAt: Date | null
  movedTo: { id: string; name: string } | null
}

export interface TelegramThreadDetail {
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
  messages: ChatMessage[]
  chat: TelegramChatInfo | null
  lastInboundAt: Date | null
  unhandled: number
}

export async function telegramThread(db: Database, contactId: string): Promise<TelegramThreadDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return null
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return null
  const [pitchRow] = await db.select({ content: pitches.content }).from(pitches).where(eq(pitches.contactId, contactId)).limit(1)
  const inbound = await db
    .select({ id: responses.id, body: responses.body, at: responses.createdAt, from: responses.fromAddress, handled: responses.handled })
    .from(responses)
    .where(and(eq(responses.contactId, contactId), eq(responses.channel, 'telegram'), eq(responses.kind, 'reply')))
    .orderBy(asc(responses.createdAt))
  const outbound = await db
    .select({ id: events.id, type: events.type, data: events.data, at: events.createdAt })
    .from(events)
    .where(and(eq(events.contactId, contactId), inArray(events.type, ['tg_reply', 'tg_greeting'])))
    .orderBy(asc(events.createdAt))
  const messages: ChatMessage[] = [
    ...inbound.map((row) => ({ id: row.id, direction: 'in' as const, kind: row.body === TELEGRAM_START_NOTE ? ('start' as const) : ('reply' as const), text: row.body ?? '', at: row.at, via: 'telegram' as const })),
    ...outbound.map((row) => ({
      id: row.id,
      direction: 'out' as const,
      kind: row.type === 'tg_greeting' ? ('greeting' as const) : ('reply' as const),
      text: typeof row.data.text === 'string' ? row.data.text : '',
      at: row.at,
      via: row.type === 'tg_greeting' ? ('bot' as const) : ('panel' as const),
    })),
  ].sort((left, right) => left.at.getTime() - right.at.getTime())
  const latest = inbound[inbound.length - 1] ?? null
  const [chatRow] = latest?.from ? await db.select().from(telegramChats).where(eq(telegramChats.chatId, latest.from)).limit(1) : []
  const [owner] =
    chatRow && chatRow.contactId !== contact.id ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.id, chatRow.contactId)).limit(1) : []
  const content = pitchRow?.content ?? null
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
    messages,
    chat: chatRow
      ? {
          chatId: chatRow.chatId,
          handle: telegramHandle(chatRow),
          username: chatRow.username,
          name: [chatRow.firstName, chatRow.lastName].filter(Boolean).join(' '),
          linkedAt: chatRow.linkedAt,
          blockedAt: chatRow.blockedAt,
          stoppedAt: chatRow.stoppedAt,
          movedTo: owner ? { id: owner.id, name: `${owner.firstName} ${owner.lastName}`.trim() } : null,
        }
      : null,
    lastInboundAt: latest?.at ?? null,
    unhandled: inbound.filter((row) => !row.handled).length,
  }
}

export async function setTelegramHandled(db: Database, contactId: string, handled: boolean, now = new Date()): Promise<void> {
  const thread = and(eq(responses.contactId, contactId), eq(responses.channel, 'telegram'), eq(responses.kind, 'reply'))
  if (handled) {
    await db.update(responses).set({ handled: true, handledAt: now }).where(and(thread, eq(responses.handled, false)))
    return
  }
  const [latest] = await db.select({ id: responses.id }).from(responses).where(thread).orderBy(desc(responses.createdAt)).limit(1)
  if (latest) await db.update(responses).set({ handled: false, handledAt: null }).where(eq(responses.id, latest.id))
}

export async function contactTelegram(db: Database, contactId: string): Promise<{ handle: string; blocked: boolean; stopped: boolean } | null> {
  const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.contactId, contactId)).orderBy(desc(telegramChats.linkedAt)).limit(1)
  return chat ? { handle: telegramHandle(chat), blocked: Boolean(chat.blockedAt), stopped: Boolean(chat.stoppedAt) } : null
}
