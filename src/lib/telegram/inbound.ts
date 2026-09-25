import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, events, responses, telegramChats } from '@/lib/db/schema'
import { contactBySlug } from '@/lib/public'
import { recordEvent, recordResponse, suppress } from '@/lib/campaign/state'
import { classifyReplyIntent } from '@/lib/inbox/classify'
import { consumeRate } from '@/lib/security/rate-limit'
import { isTelegramStop, parseStart, telegramHandle, type TelegramEvent, type TelegramUser } from '@/lib/channels/telegram'
import { claimTeamCode, unlinkTeamChat } from './config'
import { TELEGRAM_START_NOTE, sampleGreeting, teamCopy, telegramCopy } from './copy'

export const UNKNOWN_REPLY_WINDOW_MS = 6 * 60 * 60 * 1000
export const PREVIEW_WINDOW_MS = 60 * 60 * 1000
export const PREVIEW_LIMIT = 10
export const NON_TEXT_NOTE = '(metin dışı mesaj)'

export interface BotReply {
  chatId: string
  text: string
  contactId: string | null
  greeting: boolean
}

export interface TelegramNotice {
  contactId: string
  name: string
  company: string
  text: string
  handle: string
  started: boolean
  previous?: string | null
}

export type TelegramStatus = 'linked' | 'received' | 'stopped' | 'blocked' | 'unblocked' | 'team' | 'preview' | 'unknown' | 'duplicate' | 'ignored'

export interface TelegramOutcome {
  status: TelegramStatus
  replies: BotReply[]
  notices: TelegramNotice[]
}

type MessageEvent = Extract<TelegramEvent, { kind: 'message' }>
type MembershipEvent = Extract<TelegramEvent, { kind: 'membership' }>
type ContactRow = typeof contacts.$inferSelect
type ChatRow = typeof telegramChats.$inferSelect
type Found = NonNullable<Awaited<ReturnType<typeof contactBySlug>>>

function outcome(status: TelegramStatus, replies: BotReply[] = [], notices: TelegramNotice[] = []): TelegramOutcome {
  return { status, replies, notices }
}

function languageFor(user: TelegramUser | null): 'tr' | 'en' {
  const code = user?.languageCode?.toLowerCase() ?? ''
  return !code || code.startsWith('tr') ? 'tr' : 'en'
}

function greetingFor(found: Found, team: string): string {
  const { pitch } = found
  return telegramCopy[pitch.language].greeting({ name: pitch.person.greetingName, company: pitch.company.name, solution: pitch.solution.name, team })
}

function handleOf(user: TelegramUser | null): string {
  return user ? telegramHandle({ username: user.username, firstName: user.firstName, lastName: user.lastName }) : 'Telegram'
}

function notice(contact: ContactRow, event: MessageEvent, text: string, started: boolean): TelegramNotice {
  return { contactId: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), company: contact.company, text, handle: handleOf(event.from), started }
}

function profile(event: MessageEvent) {
  return {
    username: event.from?.username ?? null,
    firstName: event.from?.firstName || null,
    lastName: event.from?.lastName ?? null,
    languageCode: event.from?.languageCode ?? null,
  }
}

async function claimMessage(db: Database, input: { event: MessageEvent; contactId: string; start: boolean; at: Date }): Promise<boolean> {
  const rows = await db
    .insert(events)
    .values({
      contactId: input.contactId,
      type: 'tg_inbound',
      data: { id: `${input.event.chatId}:${input.event.messageId}`, chatId: input.event.chatId, text: (input.event.text ?? '').slice(0, 1000), start: input.start },
      createdAt: input.at,
    })
    .onConflictDoNothing()
    .returning({ id: events.id })
  return rows.length > 0
}

async function unknownChat(db: Database, event: MessageEvent, team: string, now: Date): Promise<TelegramOutcome> {
  if ((await consumeRate(db, `tg-unknown:${event.chatId}`, UNKNOWN_REPLY_WINDOW_MS, now)) > 1) return outcome('unknown')
  return outcome('unknown', [{ chatId: event.chatId, text: telegramCopy[languageFor(event.from)].unknown(team), contactId: null, greeting: false }])
}

async function linkChat(db: Database, event: MessageEvent, contactId: string, at: Date, now: Date): Promise<void> {
  const fields = { contactId, ...profile(event), linkedAt: at, blockedAt: null, stoppedAt: null, updatedAt: now }
  await db
    .insert(telegramChats)
    .values({ chatId: event.chatId, ...fields })
    .onConflictDoUpdate({ target: telegramChats.chatId, set: fields })
}

async function membership(db: Database, event: MembershipEvent, teamChatId: string, at: Date): Promise<TelegramOutcome> {
  if (teamChatId && event.chatId === teamChatId && (event.status === 'left' || event.status === 'kicked')) {
    await unlinkTeamChat(db)
    return outcome('team')
  }
  if (event.chatType !== 'private') return outcome('ignored')
  const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, event.chatId)).limit(1)
  if (!chat) return outcome('ignored')
  if (event.status === 'kicked') {
    await markChatBlocked(db, event.chatId, at)
    return outcome('blocked')
  }
  if (event.status === 'member') {
    const [cleared] = await db
      .update(telegramChats)
      .set({ blockedAt: null, updatedAt: at })
      .where(and(eq(telegramChats.chatId, event.chatId), isNotNull(telegramChats.blockedAt)))
      .returning({ contactId: telegramChats.contactId })
    if (!cleared) return outcome('ignored')
    await recordEvent(db, { contactId: cleared.contactId, type: 'tg_unblocked', data: { chatId: event.chatId }, at })
    return outcome('unblocked')
  }
  return outcome('ignored')
}

export async function handleTelegramEvent(db: Database, event: TelegramEvent, context: { team: string; teamChatId?: string; now?: Date }): Promise<TelegramOutcome> {
  const now = context.now ?? new Date()
  const at = event.at ? new Date(event.at * 1000) : now
  if (event.kind === 'membership') return membership(db, event, context.teamChatId ?? '', at)

  const start = parseStart(event.text)
  if (start?.kind === 'team') {
    const result = await claimTeamCode(db, start.code, { id: event.chatId, title: event.chatTitle ?? handleOf(event.from) }, now)
    return outcome(result === 'linked' ? 'team' : 'ignored', [{ chatId: event.chatId, text: result === 'linked' ? teamCopy.linked : teamCopy.expired, contactId: null, greeting: false }])
  }
  if (event.chatType !== 'private') return outcome('ignored')

  if (start?.kind === 'preview') {
    if ((await consumeRate(db, `tg-preview:${event.chatId}`, PREVIEW_WINDOW_MS, now)) > PREVIEW_LIMIT) return outcome('ignored')
    const found = await contactBySlug(db, start.slug)
    const greeting = found ? greetingFor(found, context.team) : telegramCopy.tr.greeting({ ...sampleGreeting, team: context.team })
    return outcome('preview', [
      { chatId: event.chatId, text: greeting, contactId: null, greeting: false },
      { chatId: event.chatId, text: teamCopy.preview, contactId: null, greeting: false },
    ])
  }

  if (start?.kind === 'contact') {
    const found = await contactBySlug(db, start.slug)
    if (!found) return unknownChat(db, event, context.team, now)
    const { contact } = found
    if (!(await claimMessage(db, { event, contactId: contact.id, start: true, at }))) return outcome('duplicate')
    const [previous] = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(telegramChats)
      .innerJoin(contacts, eq(contacts.id, telegramChats.contactId))
      .where(eq(telegramChats.chatId, event.chatId))
      .limit(1)
    await linkChat(db, event, contact.id, at, now)
    const moved = previous && previous.id !== contact.id ? previous : null
    if (moved) await recordEvent(db, { contactId: moved.id, type: 'tg_moved', data: { chatId: event.chatId, to: contact.id }, at })
    await recordResponse(db, { contactId: contact.id, channel: 'telegram', kind: 'reply', intent: 'other', body: TELEGRAM_START_NOTE, fromAddress: event.chatId, at })
    return outcome(
      'linked',
      [{ chatId: event.chatId, text: greetingFor(found, context.team), contactId: contact.id, greeting: true }],
      [{ ...notice(contact, event, TELEGRAM_START_NOTE, true), previous: moved ? `${moved.firstName} ${moved.lastName}`.trim() : null }],
    )
  }

  const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, event.chatId)).limit(1)
  const [contact] = chat ? await db.select().from(contacts).where(eq(contacts.id, chat.contactId)).limit(1) : []
  if (!chat || !contact) return unknownChat(db, event, context.team, now)
  const found = await contactBySlug(db, contact.slug)
  const language = found?.pitch.language ?? contact.language

  if (start) {
    const name = found?.pitch.person.greetingName ?? contact.firstName
    return outcome('ignored', [{ chatId: event.chatId, text: telegramCopy[language].welcomeBack(name), contactId: contact.id, greeting: false }])
  }

  if (!(await claimMessage(db, { event, contactId: contact.id, start: false, at }))) return outcome('duplicate')
  const text = event.text ?? ''
  if (isTelegramStop(text)) {
    await db.update(telegramChats).set({ stoppedAt: at, updatedAt: now }).where(eq(telegramChats.chatId, event.chatId))
    await suppress(db, { contactId: contact.id, value: `tg:${event.chatId}`, kind: 'telegram', reason: 'stop' })
    await recordEvent(db, { contactId: contact.id, type: 'unsubscribe', data: { via: 'telegram' }, at })
    return outcome('stopped', [{ chatId: event.chatId, text: telegramCopy[language].stopped, contactId: contact.id, greeting: false }])
  }
  await db.update(telegramChats).set({ ...profile(event), stoppedAt: null, updatedAt: now }).where(eq(telegramChats.chatId, event.chatId))
  const body = text || NON_TEXT_NOTE
  await recordResponse(db, { contactId: contact.id, channel: 'telegram', kind: 'reply', intent: classifyReplyIntent(text), body, fromAddress: event.chatId, at })
  return outcome('received', [], [notice(contact, event, body, false)])
}

export async function markChatBlocked(db: Database, chatId: string, at = new Date()): Promise<void> {
  const [chat] = await db
    .update(telegramChats)
    .set({ blockedAt: at, updatedAt: at })
    .where(and(eq(telegramChats.chatId, chatId), isNull(telegramChats.blockedAt)))
    .returning({ contactId: telegramChats.contactId })
  if (chat) await recordEvent(db, { contactId: chat.contactId, type: 'tg_blocked', data: { chatId }, at })
}

export async function latestTelegramChat(db: Database, contactId: string): Promise<{ chat: ChatRow; at: Date } | null> {
  const [row] = await db
    .select({ from: responses.fromAddress, at: responses.createdAt })
    .from(responses)
    .where(and(eq(responses.contactId, contactId), eq(responses.channel, 'telegram'), eq(responses.kind, 'reply')))
    .orderBy(desc(responses.createdAt))
    .limit(1)
  if (!row?.from) return null
  const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, row.from)).limit(1)
  return chat ? { chat, at: row.at } : null
}
