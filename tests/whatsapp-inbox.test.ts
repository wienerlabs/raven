import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { contacts, messages, responses } from '@/lib/db/schema'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { recordEvent } from '@/lib/campaign/state'
import { handleWhatsappEvents } from '@/lib/whatsapp/inbound'
import { setThreadHandled, whatsappInbox, whatsappThread } from '@/lib/whatsapp/inbox'
import { todayTasks } from '@/lib/today'
import { searchContacts } from '@/lib/search'
import { replyContextFor } from '@/lib/ai/reply-context'
import { clickToChatText } from '@/lib/channels/whatsapp'
import { navCounts } from '@/lib/queries'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

describe('whatsapp inbox', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
    const matrix = [
      ['First Name', 'Last Name', 'Title', 'Company', 'Email', 'Phone'],
      ['Mert', 'Kaya', 'CTO', 'Rotaport', 'mert@rotaport.com.tr', ''],
      ['Ayşe', 'Demir', 'COO', 'Lojix', 'ayse@lojix.com.tr', '+90 532 111 22 33'],
      ['Can', 'Yıldız', 'CEO', 'Denizci', 'can@denizci.com.tr', ''],
    ]
    await importContacts(db, rowsFromMatrix(matrix).rows, 'test.xlsx')
    for (const contact of await db.select().from(contacts)) await savePitch(db, contact.id, pitchFor(contact.firstName, contact.company), { source: 'import', warnings: [], approve: contact.firstName !== 'Can' })
  })

  afterEach(async () => {
    await handle.close()
  })

  async function named(firstName: string) {
    const [row] = await db.select().from(contacts).where(eq(contacts.firstName, firstName))
    return row
  }

  it('lists conversations with counts, filters, search and the latest message', async () => {
    const mert = await named('Mert')
    const ayse = await named('Ayşe')
    const now = new Date('2026-09-24T10:00:00Z')
    await handleWhatsappEvents(db, [
      { kind: 'message', providerId: 'w1', status: null, from: '905321112233', text: 'Merhaba, detay alabilir miyim?', timestamp: Math.floor(new Date('2026-09-24T08:00:00Z').getTime() / 1000) },
      { kind: 'message', providerId: 'w2', status: null, from: '905559998877', text: clickToChatText({ language: 'tr', company: 'Rotaport', solution: 'Rota Asistanı', slug: mert.slug }), timestamp: Math.floor(new Date('2026-09-24T09:00:00Z').getTime() / 1000) },
    ], now)
    await recordEvent(db, { contactId: ayse.id, type: 'wa_reply', data: { text: 'Tabii, gönderiyorum.', manual: true }, at: new Date('2026-09-24T09:30:00Z') })
    await db.update(responses).set({ handled: true }).where(eq(responses.contactId, ayse.id))

    const inbox = await whatsappInbox(db)
    expect(inbox.counts).toEqual({ all: 2, waiting: 1, unverified: 1 })
    expect(inbox.threads.map((thread) => thread.name)).toEqual(['Ayşe Demir', 'Mert Kaya'])
    expect(inbox.threads[0].lastMessage).toMatchObject({ direction: 'out', text: 'Tabii, gönderiyorum.' })
    expect(inbox.threads[1]).toMatchObject({ verified: false, from: '+905559998877', unhandled: 1 })
    expect(inbox.threads[1].windowClosesAt.toISOString()).toBe('2026-09-25T09:00:00.000Z')
    expect((await whatsappInbox(db, { filter: 'waiting' })).threads.map((thread) => thread.name)).toEqual(['Mert Kaya'])
    expect((await whatsappInbox(db, { filter: 'unverified' })).threads.map((thread) => thread.name)).toEqual(['Mert Kaya'])
    expect((await whatsappInbox(db, { search: 'lojix' })).threads.map((thread) => thread.name)).toEqual(['Ayşe Demir'])
    expect((await whatsappInbox(db, { search: '555 999' })).threads.map((thread) => thread.name)).toEqual(['Mert Kaya'])
    expect((await navCounts(db)).whatsapp).toBe(1)
  })

  it('merges first touch, inbound messages and replies into one thread', async () => {
    const ayse = await named('Ayşe')
    await db.insert(messages).values({ token: 'tok_wa_first_touch_1', contactId: ayse.id, channel: 'whatsapp', status: 'sent', sentAt: new Date('2026-09-23T09:00:00Z') })
    await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'w3', status: null, from: '905321112233', text: 'Görüşelim', timestamp: Math.floor(new Date('2026-09-23T12:00:00Z').getTime() / 1000) }])
    await recordEvent(db, { contactId: ayse.id, type: 'wa_reply', data: { text: 'Salı 14.00 uygun mu?' }, at: new Date('2026-09-23T12:05:00Z') })
    const thread = await whatsappThread(db, ayse.id)
    expect(thread?.messages.map((message) => [message.kind, message.direction, message.via])).toEqual([
      ['first-touch', 'out', 'manual'],
      ['reply', 'in', 'whatsapp'],
      ['reply', 'out', 'cloud'],
    ])
    expect(thread).toMatchObject({ verified: true, from: '+905321112233', unhandled: 1, pitch: { greetingName: 'Ayşe' } })
    expect(await whatsappThread(db, 'not-a-uuid')).toBeNull()

    const context = await replyContextFor(db, ayse.id, 'whatsapp')
    expect(context?.conversation.map((turn) => turn.direction)).toEqual(['out', 'in', 'out'])
    expect(context?.conversation[0].text).toContain('/r/')
    expect(context?.briefUrl).toMatch(/\/r\/[A-Za-z0-9]{10}$/)
    expect(context?.solution?.name).toBeTruthy()
  })

  it('closes only open messages and reopens only the latest one', async () => {
    const ayse = await named('Ayşe')
    const answeredAt = new Date('2026-09-10T10:00:00Z')
    await db.insert(responses).values([
      { contactId: ayse.id, channel: 'whatsapp', kind: 'reply', intent: 'other', body: 'Eski soru', fromAddress: '+905321112233', handled: true, handledAt: answeredAt, createdAt: new Date('2026-09-09T10:00:00Z') },
      { contactId: ayse.id, channel: 'whatsapp', kind: 'reply', intent: 'other', body: 'Eski teşekkür', fromAddress: '+905321112233', handled: true, handledAt: answeredAt, createdAt: new Date('2026-09-09T11:00:00Z') },
      { contactId: ayse.id, channel: 'whatsapp', kind: 'reply', intent: 'meeting', body: 'Yeni soru', fromAddress: '+905321112233', createdAt: new Date('2026-09-24T09:00:00Z') },
    ])
    const rows = async () => (await db.select().from(responses).where(eq(responses.contactId, ayse.id))).sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())

    await setThreadHandled(db, ayse.id, true, new Date('2026-09-24T10:00:00Z'))
    expect((await rows()).map((row) => [row.handled, row.handledAt?.toISOString()])).toEqual([
      [true, answeredAt.toISOString()],
      [true, answeredAt.toISOString()],
      [true, '2026-09-24T10:00:00.000Z'],
    ])

    await setThreadHandled(db, ayse.id, false)
    expect((await rows()).map((row) => row.handled)).toEqual([true, true, false])
    expect((await whatsappInbox(db)).threads[0].unhandled).toBe(1)
  })

  it('builds the email reply context from the first email and the answers', async () => {
    const mert = await named('Mert')
    await db.insert(responses).values([
      { contactId: mert.id, channel: 'landing', kind: 'intent', intent: 'info', createdAt: new Date('2026-09-23T10:00:00Z') },
      { contactId: mert.id, channel: 'email', kind: 'reply', intent: 'meeting', body: 'Perşembe konuşalım.', createdAt: new Date('2026-09-23T11:00:00Z') },
      { contactId: mert.id, channel: 'email', kind: 'auto_reply', intent: 'other', body: 'Ofis dışındayım', createdAt: new Date('2026-09-23T11:30:00Z') },
    ])
    const context = await replyContextFor(db, mert.id, 'email')
    expect(context?.channel).toBe('email')
    expect(context?.conversation.map((turn) => turn.text)).toEqual([expect.stringContaining('Rotaport'), '(Tek tıkla yanıt: Detay istiyor)', 'Perşembe konuşalım.'])
  })

  it('collects the tasks that need attention today', async () => {
    const mert = await named('Mert')
    const ayse = await named('Ayşe')
    const can = await named('Can')
    const now = new Date('2026-09-24T10:00:00Z')
    await db.insert(responses).values({ contactId: mert.id, channel: 'email', kind: 'reply', intent: 'meeting', body: 'Görüşelim', createdAt: now })
    await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'w4', status: null, from: '905321112233', text: 'Merhaba', timestamp: Math.floor(new Date('2026-09-23T11:30:00Z').getTime() / 1000) }], now)
    await db.insert(messages).values({ token: 'tok_wa_manual_queue_1', contactId: ayse.id, channel: 'whatsapp', status: 'manual' })
    await db.update(contacts).set({ reviewStatus: 'hold', holdReason: 'test' }).where(eq(contacts.id, can.id))
    const tasks = await todayTasks(db, now)
    const byKey = Object.fromEntries(tasks.map((task) => [task.key, task.count]))
    expect(byKey).toMatchObject({ meetings: 1, 'wa-closing': 1, manual: 1, holds: 1 })
    expect(byKey['wa-waiting']).toBeUndefined()
    expect(tasks[0]).toMatchObject({ key: 'meetings', urgent: true, href: '/yanitlar?intent=meeting' })
  })

  it('finds contacts by name, company, email and solution', async () => {
    expect((await searchContacts(db, 'ayşe dem')).map((hit) => hit.name)).toEqual(['Ayşe Demir'])
    expect((await searchContacts(db, 'rotaport')).map((hit) => hit.company)).toEqual(['Rotaport'])
    expect((await searchContacts(db, 'can@denizci')).map((hit) => hit.name)).toEqual(['Can Yıldız'])
    expect(await searchContacts(db, 'a')).toEqual([])
    expect(await searchContacts(db, '%%')).toEqual([])
  })
})
