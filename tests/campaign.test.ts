import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { campaigns, contacts, messages, responses, suppressions } from '@/lib/db/schema'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { ensureCampaign, launchCampaign, queueTestEmail, updateCampaignConfig } from '@/lib/campaign/launch'
import { dispatchDue } from '@/lib/campaign/dispatch'
import { recordResponse, suppress } from '@/lib/campaign/state'
import { handleInbound } from '@/lib/inbox/sync'
import { inWindow, localParts } from '@/lib/campaign/schedule'
import type { EmailTransport, OutgoingEmail } from '@/lib/channels/email'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

const senders = [{ id: 'main', name: 'Baturalp Güvenç', email: 'baturalp@wienerlabs.test', dailyLimit: 100 }]
const wednesdayMorning = new Date('2026-09-23T07:00:00Z')
const names = ['Mert', 'Ayşe', 'Can', 'Deniz', 'Ece', 'Selin', 'Kerem', 'Umut']

function fakeTransport(fail?: (email: OutgoingEmail) => boolean) {
  const sent: OutgoingEmail[] = []
  const transport: EmailTransport = {
    kind: 'smtp',
    async send(email) {
      if (fail?.(email)) return { providerId: null, permanentFailure: true, error: '550 5.1.1 user unknown' }
      sent.push(email)
      return { providerId: `provider-${sent.length}`, permanentFailure: false, error: null }
    },
  }
  return { sent, transport }
}

async function seed(db: Database, count: number) {
  const matrix: string[][] = [['First Name', 'Last Name', 'Title', 'Company', 'Email', 'Email Status']]
  for (let index = 0; index < count; index++) matrix.push([names[index], 'Kaya', 'CTO', `Firma${index}`, `kisi${index}@firma${index}.com.tr`, index === 0 ? 'Verified' : 'Verifying'])
  const { rows } = rowsFromMatrix(matrix)
  await importContacts(db, rows, 'test.xlsx')
  const all = await db.select().from(contacts)
  for (const contact of all) await savePitch(db, contact.id, pitchFor(contact.firstName, contact.company), { source: 'import', warnings: [], approve: true })
  return all
}

describe('campaign lifecycle', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  it('launches, sends inside the window, threads follow-ups and stops on reply', async () => {
    await seed(db, 4)
    const campaign = await ensureCampaign(db)
    const summary = await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    expect(summary.queuedEmail).toBe(4)
    const queued = await db.select().from(messages)
    expect(queued.every((message) => message.scheduledAt && inWindow(message.scheduledAt, campaign.config))).toBe(true)
    expect(new Set(queued.map((message) => message.variant))).toEqual(new Set(['a', 'b']))

    const { sent, transport } = fakeTransport()
    const report = await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 60 * 60 * 1000), transport, senders, baseUrl: 'https://raven.test', random: () => 0 })
    expect(report.sent).toBe(4)
    expect(sent).toHaveLength(4)
    expect(sent[0].to).toBe('kisi0@firma0.com.tr')
    expect(sent[0].headers['List-Unsubscribe']).toContain('https://raven.test/api/unsubscribe/')
    expect(sent[0].messageId).toMatch(/^<[A-Za-z0-9_-]+@wienerlabs\.test>$/)

    const followUps = await db.select().from(messages).where(eq(messages.step, 1))
    expect(followUps).toHaveLength(4)
    for (const followUp of followUps) expect(localParts(followUp.scheduledAt as Date, 'Europe/Istanbul').weekday).toBe(1)

    const first = (await db.select().from(messages).where(and(eq(messages.step, 0), eq(messages.status, 'sent'))))[0]
    const outcome = await handleInbound(db, {
      from: 'Mert Kaya <kisi0@firma0.com.tr>',
      subject: `Re: ${first.subject}`,
      text: 'Merhaba, perşembe bir toplantı ayarlayalım.\n\nOn Wed wrote:\n> eski metin',
      inReplyTo: first.rfcMessageId,
      references: [first.rfcMessageId as string],
      autoSubmitted: null,
      autoReplyHeader: false,
      contentType: 'text/plain',
      raw: '',
    })
    expect(outcome).toBe('reply')
    const contact = (await db.select().from(contacts).where(eq(contacts.id, first.contactId)))[0]
    expect(contact.stage).toBe('meeting')
    const reply = (await db.select().from(responses).where(eq(responses.contactId, first.contactId)))[0]
    expect(reply.body).toBe('Merhaba, perşembe bir toplantı ayarlayalım.')
    const cancelled = await db.select().from(messages).where(and(eq(messages.contactId, first.contactId), eq(messages.step, 1)))
    expect(cancelled[0].status).toBe('cancelled')

    const later = await dispatchDue(db, { now: new Date('2026-09-28T12:00:00Z'), transport, senders, baseUrl: 'https://raven.test', random: () => 0 })
    expect(later.sent).toBe(3)
    const threaded = sent.slice(4)
    expect(threaded.every((email) => email.subject.startsWith('Re: '))).toBe(true)
    expect(threaded.every((email) => email.inReplyTo && email.references?.length === 1)).toBe(true)
  })

  it('does not send before the window and never twice', async () => {
    await seed(db, 2)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: new Date('2026-09-23T18:00:00Z'), senders, random: () => 0 })
    const { sent, transport } = fakeTransport()
    const early = await dispatchDue(db, { now: new Date('2026-09-23T19:00:00Z'), transport, senders, random: () => 0 })
    expect(early.claimed).toBe(0)
    await Promise.all([
      dispatchDue(db, { now: new Date('2026-09-24T08:00:00Z'), transport, senders, random: () => 0 }),
      dispatchDue(db, { now: new Date('2026-09-24T08:00:00Z'), transport, senders, random: () => 0 }),
    ])
    expect(sent).toHaveLength(2)
  })

  it('cancels suppressed contacts and paused campaigns', async () => {
    const all = await seed(db, 3)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    await suppress(db, { contactId: all[1].id, value: all[1].email as string, kind: 'email', reason: 'unsubscribe' })
    await recordResponse(db, { contactId: all[2].id, channel: 'landing', kind: 'intent', intent: 'later' })
    const { sent, transport } = fakeTransport()
    await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 3600_000), transport, senders, random: () => 0 })
    expect(sent.map((email) => email.to)).toEqual([all[0].email])
    const stages = await db.select({ id: contacts.id, stage: contacts.stage }).from(contacts)
    expect(stages.find((row) => row.id === all[1].id)?.stage).toBe('unsubscribed')
    expect(stages.find((row) => row.id === all[2].id)?.stage).toBe('declined')

    await db.update(campaigns).set({ status: 'paused' }).where(eq(campaigns.id, campaign.id))
    const paused = await dispatchDue(db, { now: new Date('2026-09-30T12:00:00Z'), transport, senders, random: () => 0 })
    expect(paused.claimed).toBe(0)
  })

  it('treats permanent failures as bounces and pauses on a high bounce rate', async () => {
    await seed(db, 4)
    const campaign = await ensureCampaign(db)
    await updateCampaignConfig(db, campaign.id, { ...campaign.config, bounceGuardMinSent: 2, bounceGuardMaxRate: 0.3 })
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    const { transport } = fakeTransport((email) => email.to.startsWith('kisi1') || email.to.startsWith('kisi2'))
    const report = await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 3600_000), transport, senders, random: () => 0 })
    expect(report.failed).toBe(2)
    const blocked = await db.select().from(suppressions)
    expect(blocked.map((row) => row.reason)).toEqual(['bounce', 'bounce'])
    const state = (await db.select().from(campaigns).where(eq(campaigns.id, campaign.id)))[0]
    expect(state.status).toBe('paused')
    expect(state.pauseReason).toContain('Geri dönme oranı')
  })

  it('reschedules when the daily sender limit is reached', async () => {
    await seed(db, 3)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders: [{ ...senders[0], dailyLimit: 1000 }], random: () => 0 })
    const { sent, transport } = fakeTransport()
    await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 3600_000), transport, senders: [{ ...senders[0], dailyLimit: 2 }], random: () => 0 })
    expect(sent).toHaveLength(2)
    const pending = await db.select().from(messages).where(and(eq(messages.step, 0), eq(messages.status, 'scheduled')))
    expect(pending).toHaveLength(1)
    expect(localParts(pending[0].scheduledAt as Date, 'Europe/Istanbul').day).toBe(24)
  })

  it('sends test emails to the test recipient without touching the funnel', async () => {
    const all = await seed(db, 1)
    await queueTestEmail(db, all[0].id, 'me@wienerlabs.test')
    const { sent, transport } = fakeTransport()
    await dispatchDue(db, { now: new Date(), transport, senders, random: () => 0 })
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('me@wienerlabs.test')
    expect(sent[0].subject.startsWith('Test: ')).toBe(true)
    const contact = (await db.select().from(contacts))[0]
    expect(contact.stage).toBe('new')
  })
})
