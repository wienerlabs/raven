import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { contacts, messages } from '@/lib/db/schema'
import { classifySmtpFailure, type EmailTransport, type OutgoingEmail, type SendResult } from '@/lib/channels/email'
import { isPrivateAddress, fetchWebsite } from '@/lib/research/website'
import { clearLoginFailures, LOGIN_LIMITS, LOGIN_WINDOW_MS, loginBlocked, registerLoginFailure } from '@/lib/security/login-limit'
import { acquireLease, releaseLease } from '@/lib/campaign/lease'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { ensureCampaign, launchCampaign } from '@/lib/campaign/launch'
import { dispatchDue } from '@/lib/campaign/dispatch'
import { recordResponse, suppress } from '@/lib/campaign/state'
import { pitchSchema } from '@/lib/pitch/schema'
import { examplePitch } from '@/lib/ai/prompt'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

const senders = [{ id: 'main', name: 'Baturalp Güvenç', email: 'baturalp@wienerlabs.test', dailyLimit: 100 }]
const wednesdayMorning = new Date('2026-09-23T07:00:00Z')

describe('smtp failure classification', () => {
  it('retries only when the message body was not transmitted', () => {
    expect(classifySmtpFailure({ code: 'ECONNECTION', command: 'CONN' })).toEqual({ permanentFailure: false, retryable: true })
    expect(classifySmtpFailure({ code: 'EAUTH', command: 'AUTH PLAIN' })).toEqual({ permanentFailure: false, retryable: true })
    expect(classifySmtpFailure({ responseCode: 451, command: 'RCPT TO' })).toEqual({ permanentFailure: false, retryable: true })
    expect(classifySmtpFailure({ code: 'ETIMEDOUT', command: 'DATA' })).toEqual({ permanentFailure: false, retryable: false })
    expect(classifySmtpFailure({ code: 'ESOCKET' })).toEqual({ permanentFailure: false, retryable: false })
    expect(classifySmtpFailure({ responseCode: 550, command: 'RCPT TO' })).toEqual({ permanentFailure: true, retryable: false })
    expect(classifySmtpFailure(new Error('unknown'))).toEqual({ permanentFailure: false, retryable: false })
  })
})

describe('private address detection', () => {
  it('blocks loopback, private, link local and metadata ranges', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(address)).toBe(true)
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888']) expect(isPrivateAddress(address)).toBe(false)
  })

  it('refuses internal hosts before any request', async () => {
    expect((await fetchWebsite('localhost')).error).toBe('invalid domain')
    expect((await fetchWebsite('intranet.corp')).error).toBe('invalid domain')
  })
})

describe('pitch schema', () => {
  it('rejects line breaks in single line fields', () => {
    const broken = structuredClone(examplePitch)
    broken.email.subject = 'Rotaport için\nkısa bir fikir'
    expect(pitchSchema.safeParse(broken).success).toBe(false)
    expect(pitchSchema.safeParse(examplePitch).success).toBe(true)
  })
})

describe('database backed safeguards', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  async function seed(count: number) {
    const matrix: string[][] = [['First Name', 'Last Name', 'Title', 'Company', 'Email']]
    for (let index = 0; index < count; index++) matrix.push([['Mert', 'Ayşe', 'Can', 'Deniz'][index], 'Kaya', 'CTO', `Firma${index}`, `kisi${index}@firma${index}.com.tr`])
    await importContacts(db, rowsFromMatrix(matrix).rows, 'test.xlsx')
    const all = await db.select().from(contacts)
    for (const contact of all) await savePitch(db, contact.id, pitchFor(contact.firstName, contact.company), { source: 'import', warnings: [], approve: true })
    return all
  }

  function transport(handler: (email: OutgoingEmail) => Promise<SendResult> | SendResult): EmailTransport {
    return { kind: 'smtp', send: async (email) => handler(email) }
  }

  it('limits login attempts per address and resets after the window', async () => {
    const now = new Date('2026-09-23T10:00:00Z')
    for (let index = 0; index < LOGIN_LIMITS.ip; index++) await registerLoginFailure(db, '203.0.113.9', now)
    expect(await loginBlocked(db, '203.0.113.9', now)).toBe(true)
    expect(await loginBlocked(db, '198.51.100.7', now)).toBe(false)
    expect(await loginBlocked(db, '203.0.113.9', new Date(now.getTime() + LOGIN_WINDOW_MS + 1000))).toBe(false)
    await clearLoginFailures(db, '203.0.113.9')
    expect(await loginBlocked(db, '203.0.113.9', now)).toBe(false)
  })

  it('keeps passkey attempts out of the shared lockout', async () => {
    const now = new Date('2026-09-23T10:00:00Z')
    for (let index = 0; index < LOGIN_LIMITS.global; index++) await registerLoginFailure(db, `198.51.100.${index}`, now)
    expect(await loginBlocked(db, '192.0.2.1', now)).toBe(true)
    expect(await loginBlocked(db, '192.0.2.1', now, { global: false })).toBe(false)
    for (let index = 0; index < LOGIN_LIMITS.ip; index++) await registerLoginFailure(db, '192.0.2.9', now, { global: false })
    expect(await loginBlocked(db, '192.0.2.9', now, { global: false })).toBe(true)
  })

  it('grants a lease to one holder at a time', async () => {
    const now = new Date('2026-09-23T10:00:00Z')
    const first = await acquireLease(db, 'dispatch', 60_000, now)
    expect(first).not.toBeNull()
    expect(await acquireLease(db, 'dispatch', 60_000, now)).toBeNull()
    expect(await acquireLease(db, 'dispatch', 60_000, new Date(now.getTime() + 61_000))).not.toBeNull()
    await releaseLease(db, 'dispatch', first as string)
  })

  it('never queues the same contact twice when launches overlap', async () => {
    await seed(3)
    const campaign = await ensureCampaign(db)
    const results = await Promise.all([
      launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 }),
      launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 }),
    ])
    const queued = await db.select().from(messages).where(eq(messages.step, 0))
    expect(queued).toHaveLength(3)
    expect(results.reduce((sum, result) => sum + result.queuedEmail, 0)).toBe(3)
  })

  it('does not schedule a follow up when the reply lands during the send', async () => {
    const all = await seed(1)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    const replying = transport(async () => {
      await recordResponse(db, { contactId: all[0].id, channel: 'email', kind: 'reply', intent: 'meeting', body: 'Görüşelim' })
      return { providerId: 'p-1', permanentFailure: false, retryable: false, error: null }
    })
    const report = await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 3600_000), transport: replying, senders, random: () => 0 })
    expect(report.sent).toBe(1)
    const followUps = await db.select().from(messages).where(and(eq(messages.step, 1), eq(messages.status, 'scheduled')))
    expect(followUps).toHaveLength(0)
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, all[0].id))
    expect(contact.stage).toBe('meeting')
  })

  it('fails uncertain deliveries instead of retrying them', async () => {
    await seed(2)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    const flaky = transport((email) =>
      email.to.startsWith('kisi0')
        ? { providerId: null, permanentFailure: false, retryable: false, error: 'Timeout' }
        : { providerId: null, permanentFailure: false, retryable: true, error: 'Connection refused' },
    )
    await dispatchDue(db, { now: new Date(wednesdayMorning.getTime() + 3600_000), transport: flaky, senders, random: () => 0 })
    const rows = await db.select({ to: contacts.email, status: messages.status, error: messages.lastError }).from(messages).innerJoin(contacts, eq(contacts.id, messages.contactId))
    expect(rows.find((row) => row.to?.startsWith('kisi0'))?.status).toBe('failed')
    expect(rows.find((row) => row.to?.startsWith('kisi0'))?.error).toContain('teslim durumu belirsiz')
    expect(rows.find((row) => row.to?.startsWith('kisi1'))?.status).toBe('scheduled')
  })

  it('cancels messages for a suppressed domain', async () => {
    await seed(2)
    const campaign = await ensureCampaign(db)
    await launchCampaign(db, campaign.id, { now: wednesdayMorning, senders, random: () => 0 })
    await suppress(db, { value: 'firma1.com.tr', kind: 'domain', reason: 'manual' })
    const sent: string[] = []
    await dispatchDue(db, {
      now: new Date(wednesdayMorning.getTime() + 3600_000),
      transport: transport((email) => {
        sent.push(email.to)
        return { providerId: 'p', permanentFailure: false, retryable: false, error: null }
      }),
      senders,
      random: () => 0,
    })
    expect(sent).toEqual(['kisi0@firma0.com.tr'])
  })
})
