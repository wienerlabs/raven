import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/db'
import { contacts, events, messages, responses, suppressions, telegramChats } from '@/lib/db/schema'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { recordEvent } from '@/lib/campaign/state'
import { contactPayload, previewPayload, teamPayload, type TelegramEvent } from '@/lib/channels/telegram'
import { claimTeamCode, getStoredTelegram, issueTeamCode, recordWebhook, resolveTelegram, saveTelegramBot, telegramChecklist, TEAM_CODE_TTL_MS } from '@/lib/telegram/config'
import { handleTelegramEvent, latestTelegramChat, markChatBlocked, NON_TEXT_NOTE, PREVIEW_LIMIT } from '@/lib/telegram/inbound'
import { contactTelegram, setTelegramHandled, telegramInbox, telegramThread } from '@/lib/telegram/inbox'
import { TELEGRAM_START_NOTE, teamCopy, telegramCopy } from '@/lib/telegram/copy'
import { replyContextFor } from '@/lib/ai/reply-context'
import { notifyTeam } from '@/lib/notify'
import { navCounts } from '@/lib/queries'
import { todayTasks } from '@/lib/today'
import { defaultSettings } from '@/lib/settings'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

const token = `123456789:${'raven_test_token_'.repeat(2)}xyz`
const team = 'Wiener Labs'
let messageId = 100

function textFrom(chatId: string, text: string | null, options: { at?: Date; username?: string | null; language?: string; chatType?: string; title?: string } = {}): TelegramEvent {
  messageId += 1
  return {
    kind: 'message',
    updateId: messageId,
    chatId,
    chatType: options.chatType ?? 'private',
    chatTitle: options.title ?? null,
    messageId,
    from: { id: chatId, username: options.username === undefined ? 'deniz' : options.username, firstName: 'Deniz', lastName: 'Aksoy', languageCode: options.language ?? 'tr' },
    text,
    at: Math.floor((options.at ?? new Date('2026-09-25T09:00:00Z')).getTime() / 1000),
  }
}

describe('telegram channel', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
    const matrix = [
      ['First Name', 'Last Name', 'Title', 'Company', 'Email', 'Phone'],
      ['Deniz', 'Aksoy', 'Operasyon Direktörü', 'Kuzey Lojistik', 'deniz@kuzey.com.tr', ''],
      ['Mert', 'Kaya', 'CTO', 'Rotaport', 'mert@rotaport.com.tr', ''],
      ['Jane', 'Doe', 'COO', 'Harbor', 'jane@harbor.io', ''],
    ]
    await importContacts(db, rowsFromMatrix(matrix).rows, 'test.xlsx')
    for (const contact of await db.select().from(contacts)) {
      await savePitch(db, contact.id, pitchFor(contact.firstName, contact.company, contact.firstName === 'Jane' ? { language: 'en' } : {}), { source: 'import', warnings: [], approve: true })
    }
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await handle.close()
  })

  async function named(firstName: string) {
    const [row] = await db.select().from(contacts).where(eq(contacts.firstName, firstName))
    return row
  }

  it('keeps the bot token sealed and the webhook secret stable for the same bot', async () => {
    const first = await saveTelegramBot(db, { token, botId: '777', username: 'WienerLabsBot', botName: 'Wiener Labs' })
    expect(JSON.stringify(first)).not.toContain(token)
    expect(first.webhookSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    let resolved = await resolveTelegram(db)
    expect(resolved).toMatchObject({ token, username: 'WienerLabsBot', ready: false })
    expect(telegramChecklist(resolved)).toEqual([
      { key: 'bot', done: true },
      { key: 'webhook', done: false },
      { key: 'team', done: false },
    ])
    await recordWebhook(db, { error: null, at: new Date('2026-09-25T08:00:00Z') })
    resolved = await resolveTelegram(db)
    expect(resolved.ready).toBe(true)
    const again = await saveTelegramBot(db, { token, botId: '777', username: 'WienerLabsBot', botName: 'Wiener Labs' })
    expect(again.webhookSecret).toBe(first.webhookSecret)
    expect(again.webhookSetAt).toBe('2026-09-25T08:00:00.000Z')
    const other = await saveTelegramBot(db, { token, botId: '888', username: 'OtherBot', botName: 'Other' })
    expect(other.webhookSecret).not.toBe(first.webhookSecret)
    expect(other.webhookSetAt).toBeNull()
  })

  it('links a chat from the personal brief, greets the contact and stops follow ups', async () => {
    const deniz = await named('Deniz')
    await db.insert(messages).values({ token: 'tok_tg_follow_up_0001', contactId: deniz.id, channel: 'email', step: 1, status: 'scheduled', scheduledAt: new Date('2026-09-28T09:00:00Z') })
    const start = textFrom('555', `/start ${contactPayload(deniz.slug)}`)
    const outcome = await handleTelegramEvent(db, start, { team })
    expect(outcome.status).toBe('linked')
    expect(outcome.replies).toEqual([{ chatId: '555', text: telegramCopy.tr.greeting({ name: 'Deniz', company: 'Kuzey Lojistik', solution: pitchFor('Deniz', 'Kuzey Lojistik').solution.name, team }), contactId: deniz.id, greeting: true }])
    expect(outcome.notices).toEqual([{ contactId: deniz.id, name: 'Deniz Aksoy', company: 'Kuzey Lojistik', text: TELEGRAM_START_NOTE, handle: '@deniz', started: true, previous: null }])
    const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat).toMatchObject({ contactId: deniz.id, username: 'deniz', firstName: 'Deniz', lastName: 'Aksoy', languageCode: 'tr', blockedAt: null, stoppedAt: null })
    expect((await named('Deniz')).stage).toBe('replied')
    const [followUp] = await db.select().from(messages).where(eq(messages.token, 'tok_tg_follow_up_0001'))
    expect(followUp.status).toBe('cancelled')
    expect((await handleTelegramEvent(db, start, { team })).status).toBe('duplicate')
    expect(await db.select().from(responses).where(eq(responses.channel, 'telegram'))).toHaveLength(1)
  })

  it('records replies with intent, non text messages and profile changes', async () => {
    const deniz = await named('Deniz')
    await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(deniz.slug)}`), { team })
    const meeting = await handleTelegramEvent(db, textFrom('555', 'Görüşelim, salı uygun mu?', { at: new Date('2026-09-25T10:00:00Z'), username: 'deniz_aksoy' }), { team })
    expect(meeting.status).toBe('received')
    expect(meeting.replies).toEqual([])
    expect(meeting.notices[0]).toMatchObject({ contactId: deniz.id, text: 'Görüşelim, salı uygun mu?', handle: '@deniz_aksoy', started: false })
    const sticker = await handleTelegramEvent(db, textFrom('555', null, { at: new Date('2026-09-25T10:05:00Z'), username: 'deniz_aksoy' }), { team })
    expect(sticker.notices[0].text).toBe(NON_TEXT_NOTE)
    const rows = await db.select().from(responses).where(and(eq(responses.contactId, deniz.id), eq(responses.channel, 'telegram'))).orderBy(responses.createdAt)
    expect(rows.map((row) => [row.body, row.intent, row.fromAddress])).toEqual([
      [TELEGRAM_START_NOTE, 'other', '555'],
      ['Görüşelim, salı uygun mu?', 'meeting', '555'],
      [NON_TEXT_NOTE, 'other', '555'],
    ])
    expect((await named('Deniz')).stage).toBe('meeting')
    const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.username).toBe('deniz_aksoy')
  })

  it('answers strangers once per window without linking them', async () => {
    const now = new Date('2026-09-25T09:00:00Z')
    const first = await handleTelegramEvent(db, textFrom('999', 'Merhaba'), { team, now })
    expect(first).toMatchObject({ status: 'unknown', replies: [{ chatId: '999', text: telegramCopy.tr.unknown(team), contactId: null, greeting: false }] })
    expect((await handleTelegramEvent(db, textFrom('999', 'Kimsiniz?'), { team, now })).replies).toEqual([])
    const english = await handleTelegramEvent(db, textFrom('998', '/start r-NoSuchSlug1', { language: 'de' }), { team, now })
    expect(english.replies[0].text).toBe(telegramCopy.en.unknown(team))
    const later = await handleTelegramEvent(db, textFrom('999', 'Hala orada mısınız?'), { team, now: new Date(now.getTime() + 7 * 60 * 60 * 1000) })
    expect(later.replies).toHaveLength(1)
    expect(await db.select().from(telegramChats)).toHaveLength(0)
    expect(await db.select().from(responses)).toHaveLength(0)
  })

  it('shows previews without linking anyone and limits them per chat', async () => {
    const jane = await named('Jane')
    const outcome = await handleTelegramEvent(db, textFrom('555', `/start ${previewPayload(jane.slug)}`), { team })
    expect(outcome.status).toBe('preview')
    expect(outcome.replies.map((item) => item.text)).toEqual([telegramCopy.en.greeting({ name: 'Jane', company: 'Harbor', solution: pitchFor('Jane', 'Harbor').solution.name, team }), teamCopy.preview])
    expect(outcome.replies.every((item) => item.contactId === null && !item.greeting)).toBe(true)
    const sample = await handleTelegramEvent(db, textFrom('555', `/start ${previewPayload('Unknown123')}`), { team })
    expect(sample.replies[0].text).toContain('Rotaport')
    expect(await db.select().from(telegramChats)).toHaveLength(0)
    expect(await db.select().from(responses)).toHaveLength(0)
    expect(await db.select().from(events)).toHaveLength(0)
    const now = new Date('2026-09-25T09:00:00Z')
    for (let index = 0; index < PREVIEW_LIMIT; index += 1) await handleTelegramEvent(db, textFrom('600', `/start ${previewPayload(jane.slug)}`), { team, now })
    const limited = await handleTelegramEvent(db, textFrom('600', `/start ${previewPayload(jane.slug)}`), { team, now })
    expect(limited).toMatchObject({ status: 'ignored', replies: [] })
    expect((await handleTelegramEvent(db, textFrom('600', `/start ${previewPayload(jane.slug)}`), { team, now: new Date(now.getTime() + 61 * 60 * 1000) })).replies).toHaveLength(2)
  })

  it('honours a stop, confirms it and lets the contact write again later', async () => {
    const deniz = await named('Deniz')
    await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(deniz.slug)}`), { team })
    await db.insert(messages).values({ token: 'tok_tg_follow_up_0002', contactId: deniz.id, channel: 'email', step: 2, status: 'scheduled' })
    const stop = await handleTelegramEvent(db, textFrom('555', 'DUR'), { team })
    expect(stop).toMatchObject({ status: 'stopped', replies: [{ chatId: '555', text: telegramCopy.tr.stopped, contactId: deniz.id }] })
    expect((await named('Deniz')).stage).toBe('unsubscribed')
    expect(await db.select().from(suppressions)).toEqual([expect.objectContaining({ value: 'tg:555', kind: 'telegram', reason: 'stop' })])
    let [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.stoppedAt).not.toBeNull()
    const [pending] = await db.select().from(messages).where(eq(messages.token, 'tok_tg_follow_up_0002'))
    expect(pending.status).toBe('cancelled')
    const back = await handleTelegramEvent(db, textFrom('555', 'Aslında bir sorum olacak'), { team })
    expect(back.status).toBe('received')
    ;[chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.stoppedAt).toBeNull()
    expect((await named('Deniz')).stage).toBe('unsubscribed')
  })

  it('moves a chat to the brief it was last started from and keeps the old thread read only', async () => {
    const deniz = await named('Deniz')
    const mert = await named('Mert')
    await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(deniz.slug)}`, { at: new Date('2026-09-25T08:00:00Z') }), { team })
    await handleTelegramEvent(db, textFrom('555', 'Deniz adına yazıyorum', { at: new Date('2026-09-25T08:10:00Z') }), { team })
    const moved = await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(mert.slug)}`, { at: new Date('2026-09-25T09:00:00Z') }), { team })
    expect(moved.status).toBe('linked')
    expect(moved.notices[0]).toMatchObject({ contactId: mert.id, previous: 'Deniz Aksoy' })
    const [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.contactId).toBe(mert.id)
    expect(await db.select().from(events).where(and(eq(events.contactId, deniz.id), eq(events.type, 'tg_moved')))).toHaveLength(1)
    const old = await telegramThread(db, deniz.id)
    expect(old?.chat?.movedTo).toEqual({ id: mert.id, name: 'Mert Kaya' })
    expect(old?.unhandled).toBe(2)
    expect((await telegramThread(db, mert.id))?.chat?.movedTo).toBeNull()
    const inbox = await telegramInbox(db)
    expect(inbox.threads.find((thread) => thread.contactId === deniz.id)?.moved).toBe(true)
    expect(inbox.threads.find((thread) => thread.contactId === mert.id)?.moved).toBe(false)
    expect((await latestTelegramChat(db, deniz.id))?.chat.contactId).toBe(mert.id)
    const next = await handleTelegramEvent(db, textFrom('555', 'Şimdi Rotaport için soruyorum', { at: new Date('2026-09-25T09:10:00Z') }), { team })
    expect(next.notices[0].contactId).toBe(mert.id)
    expect(await contactTelegram(db, deniz.id)).toBeNull()
    expect((await contactTelegram(db, mert.id))?.handle).toBe('@deniz')
    const again = await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(mert.slug)}`, { at: new Date('2026-09-25T09:20:00Z') }), { team })
    expect(again.notices[0].previous).toBeNull()
  })

  it('welcomes a linked contact back on a plain start', async () => {
    const jane = await named('Jane')
    await handleTelegramEvent(db, textFrom('777', `/start ${contactPayload(jane.slug)}`, { language: 'en' }), { team })
    const again = await handleTelegramEvent(db, textFrom('777', '/start'), { team })
    expect(again.replies).toEqual([{ chatId: '777', text: telegramCopy.en.welcomeBack('Jane'), contactId: jane.id, greeting: false }])
  })

  it('tracks blocking and unblocking of the bot', async () => {
    const deniz = await named('Deniz')
    await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(deniz.slug)}`), { team })
    const at = Math.floor(new Date('2026-09-25T11:00:00Z').getTime() / 1000)
    expect((await handleTelegramEvent(db, { kind: 'membership', updateId: 1, chatId: '555', chatType: 'private', chatTitle: null, status: 'kicked', at }, { team })).status).toBe('blocked')
    let [chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.blockedAt?.toISOString()).toBe('2026-09-25T11:00:00.000Z')
    expect((await telegramInbox(db)).threads[0].blocked).toBe(true)
    expect((await handleTelegramEvent(db, { kind: 'membership', updateId: 2, chatId: '555', chatType: 'private', chatTitle: null, status: 'member', at }, { team })).status).toBe('unblocked')
    ;[chat] = await db.select().from(telegramChats).where(eq(telegramChats.chatId, '555'))
    expect(chat.blockedAt).toBeNull()
    await markChatBlocked(db, '555')
    await markChatBlocked(db, '555')
    const blocked = await db.select().from(events).where(and(eq(events.contactId, deniz.id), eq(events.type, 'tg_blocked')))
    expect(blocked).toHaveLength(2)
    expect((await handleTelegramEvent(db, { kind: 'membership', updateId: 3, chatId: '404', chatType: 'private', chatTitle: null, status: 'kicked', at }, { team })).status).toBe('ignored')
  })

  it('links the team chat with a one time code and unlinks it when the bot leaves', async () => {
    await saveTelegramBot(db, { token, botId: '777', username: 'WienerLabsBot', botName: 'Wiener Labs' })
    const now = new Date('2026-09-25T09:00:00Z')
    const { code } = await issueTeamCode(db, now)
    const wrong = await handleTelegramEvent(db, textFrom('-100', `/start@WienerLabsBot ${teamPayload('x'.repeat(24))}`, { chatType: 'supergroup', title: 'Satış ekibi' }), { team, now })
    expect(wrong.replies[0].text).toBe(teamCopy.expired)
    const linked = await handleTelegramEvent(db, textFrom('-100', `/start@WienerLabsBot ${teamPayload(code)}`, { chatType: 'supergroup', title: 'Satış ekibi' }), { team, now })
    expect(linked).toMatchObject({ status: 'team', replies: [{ chatId: '-100', text: teamCopy.linked }] })
    expect((await resolveTelegram(db)).team).toMatchObject({ chatId: '-100', title: 'Satış ekibi' })
    expect(await claimTeamCode(db, code, { id: '-200', title: 'Başka' }, now)).toBe('expired')
    const raced = await issueTeamCode(db, now)
    await recordWebhook(db, { error: 'Wrong response from the webhook: 500' })
    expect((await getStoredTelegram(db)).teamCode).toBe(raced.code)
    const claims = await Promise.all([claimTeamCode(db, raced.code, { id: '-400', title: 'Birinci' }, now), claimTeamCode(db, raced.code, { id: '-500', title: 'İkinci' }, now)])
    expect(claims.filter((claim) => claim === 'linked')).toHaveLength(1)
    expect(['-400', '-500']).toContain((await resolveTelegram(db)).team?.chatId)
    expect(await claimTeamCode(db, 'short', { id: '-600', title: 'Kısa' }, now)).toBe('expired')
    const late = await issueTeamCode(db, now)
    expect(await claimTeamCode(db, late.code, { id: '-300', title: 'Geç' }, new Date(now.getTime() + TEAM_CODE_TTL_MS + 1))).toBe('expired')
    expect((await handleTelegramEvent(db, textFrom('-100', 'Merhaba grup', { chatType: 'supergroup' }), { team, now })).status).toBe('ignored')
    await handleTelegramEvent(db, { kind: 'membership', updateId: 9, chatId: '-100', chatType: 'supergroup', chatTitle: 'Satış ekibi', status: 'left', at: 0 }, { team, teamChatId: '-100' })
    expect((await resolveTelegram(db)).team).toBeNull()
    expect((await getStoredTelegram(db)).teamCode).toBe('')
  })

  it('builds the inbox, the thread and the counts around Telegram conversations', async () => {
    const deniz = await named('Deniz')
    const mert = await named('Mert')
    await handleTelegramEvent(db, textFrom('555', `/start ${contactPayload(deniz.slug)}`, { at: new Date('2026-09-25T08:00:00Z') }), { team })
    await recordEvent(db, { contactId: deniz.id, type: 'tg_greeting', data: { text: 'Merhaba Deniz', id: '1', chatId: '555' }, at: new Date('2026-09-25T08:00:01Z') })
    await handleTelegramEvent(db, textFrom('555', 'Fiyat nedir?', { at: new Date('2026-09-25T08:30:00Z') }), { team })
    await recordEvent(db, { contactId: deniz.id, type: 'tg_reply', data: { text: 'Kısa bir görüşmede konuşalım.', id: '2', chatId: '555' }, at: new Date('2026-09-25T08:45:00Z') })
    await handleTelegramEvent(db, textFrom('556', `/start ${contactPayload(mert.slug)}`, { at: new Date('2026-09-25T09:00:00Z'), username: null }), { team })

    const inbox = await telegramInbox(db)
    expect(inbox.counts).toEqual({ all: 2, waiting: 2 })
    expect(inbox.threads.map((thread) => [thread.name, thread.handle])).toEqual([
      ['Mert Kaya', 'Deniz Aksoy'],
      ['Deniz Aksoy', '@deniz'],
    ])
    expect(inbox.threads[1].lastMessage).toMatchObject({ direction: 'out', text: 'Kısa bir görüşmede konuşalım.' })
    expect((await telegramInbox(db, { search: '@deniz' })).threads.map((thread) => thread.name)).toEqual(['Deniz Aksoy'])

    const thread = await telegramThread(db, deniz.id)
    expect(thread?.messages.map((message) => [message.kind, message.direction, message.via])).toEqual([
      ['start', 'in', 'telegram'],
      ['greeting', 'out', 'bot'],
      ['reply', 'in', 'telegram'],
      ['reply', 'out', 'panel'],
    ])
    expect(thread?.chat).toMatchObject({ chatId: '555', handle: '@deniz', name: 'Deniz Aksoy', blockedAt: null, stoppedAt: null })
    expect(thread?.unhandled).toBe(2)
    expect(await telegramThread(db, 'not-a-uuid')).toBeNull()
    expect((await latestTelegramChat(db, deniz.id))?.chat.chatId).toBe('555')

    expect((await navCounts(db)).telegram).toBe(2)
    const tasks = await todayTasks(db)
    expect(tasks.find((task) => task.key === 'tg-waiting')?.count).toBe(2)
    expect(tasks.find((task) => task.key === 'replies')).toBeUndefined()

    await setTelegramHandled(db, deniz.id, true)
    expect((await telegramInbox(db, { filter: 'waiting' })).threads.map((item) => item.name)).toEqual(['Mert Kaya'])
    await setTelegramHandled(db, deniz.id, false)
    expect((await telegramThread(db, deniz.id))?.unhandled).toBe(1)

    const context = await replyContextFor(db, deniz.id, 'telegram')
    expect(context?.channel).toBe('telegram')
    expect(context?.conversation.map((turn) => [turn.direction, turn.text])).toEqual([
      ['out', 'Merhaba Deniz'],
      ['in', 'Fiyat nedir?'],
      ['out', 'Kısa bir görüşmede konuşalım.'],
    ])
  })

  it('sends team notifications to the linked Telegram chat', async () => {
    await saveTelegramBot(db, { token, botId: '777', username: 'WienerLabsBot', botName: 'Wiener Labs' })
    const { code } = await issueTeamCode(db)
    await claimTeamCode(db, code, { id: '-100', title: 'Satış ekibi' })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 5 } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await notifyTeam(db, defaultSettings, 'Deniz Aksoy yanıt verdi', ['Kuzey Lojistik', '', 'Görüşelim'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`)
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: '-100', text: 'Deniz Aksoy yanıt verdi\n\nKuzey Lojistik\n\nGörüşelim', link_preview_options: { is_disabled: true } })
  })
})
