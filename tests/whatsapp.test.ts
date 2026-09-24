import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { contacts, events, messages, responses, suppressions } from '@/lib/db/schema'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { chatReference, clickToChatText, findReference, templateCreatePayload, templateDefinitions } from '@/lib/channels/whatsapp'
import { openSecret, sealSecret } from '@/lib/security/secrets'
import { getStoredWhatsapp, resolveFrom, resolveWhatsapp, saveWhatsappSettings, storedSchema } from '@/lib/whatsapp/config'
import { handleWhatsappEvents, linkWhatsappSender, replyWindowOpen } from '@/lib/whatsapp/inbound'
import { renderEmail } from '@/lib/email/render'
import { defaultSettings } from '@/lib/settings'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

const secret = 'k'.repeat(40)

describe('sealed secrets', () => {
  it('round trips and refuses tampering or another key', () => {
    const sealed = sealSecret('EAAG-token', secret)
    expect(sealed).not.toContain('EAAG')
    expect(openSecret(sealed, secret)).toBe('EAAG-token')
    expect(openSecret(sealed, 'x'.repeat(40))).toBeNull()
    const parts = sealed.split('.')
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA')
    expect(openSecret(parts.join('.'), secret)).toBeNull()
    expect(openSecret(null, secret)).toBeNull()
  })
})

describe('whatsapp helpers', () => {
  it('finds the reference code inside a message', () => {
    const text = clickToChatText({ language: 'tr', company: 'Rotaport', solution: 'Rota Asistanı', slug: 'AbCdE12345' })
    expect(text).toContain(chatReference('AbCdE12345'))
    expect(findReference(text)).toBe('AbCdE12345')
    expect(findReference('Merhaba, ref yok')).toBeNull()
    expect(findReference('XR-AbCdE12345')).toBeNull()
    expect(findReference('R-AbCdE123456')).toBeNull()
  })

  it('builds templates Meta accepts', () => {
    for (const definition of templateDefinitions('https://raven.example.com/')) {
      expect(definition.footer.length).toBeLessThanOrEqual(60)
      expect(definition.body.match(/\{\{\d\}\}/g)).toEqual(['{{1}}', '{{2}}', '{{3}}'])
      expect(definition.url).toBe('https://raven.example.com/r/{{1}}')
      const payload = templateCreatePayload('raven_intro', definition)
      expect(payload.category).toBe('MARKETING')
      expect(payload.components[0]).toMatchObject({ type: 'BODY', example: { body_text: [definition.example.body] } })
    }
  })

  it('prefers panel settings and falls back to environment values', () => {
    const stored = storedSchema.parse({ phoneNumberId: '123', tokenSealed: sealSecret('panel-token'), businessNumber: '+905320000000', autoSend: true })
    const resolved = resolveFrom(stored, { WHATSAPP_TOKEN: 'env-token', WHATSAPP_APP_SECRET: 'env-secret' } as unknown as NodeJS.ProcessEnv)
    expect(resolved.mode).toBe('cloud')
    expect(resolved.cloud?.token).toBe('panel-token')
    expect(resolved.appSecret).toBe('env-secret')
    expect(resolved.businessNumber).toBe('+905320000000')
    const manual = resolveFrom(storedSchema.parse({ autoSend: true }), {} as NodeJS.ProcessEnv)
    expect(manual.mode).toBe('manual')
    expect(manual.cloud).toBeNull()
  })

  it('keeps the reply window to 24 hours', () => {
    const now = new Date('2026-09-23T12:00:00Z')
    expect(replyWindowOpen(new Date('2026-09-22T13:00:00Z'), now)).toBe(true)
    expect(replyWindowOpen(new Date('2026-09-22T11:00:00Z'), now)).toBe(false)
    expect(replyWindowOpen(null, now)).toBe(false)
  })

  it('adds the chat link to emails only when a business number exists', () => {
    const base = { contact: { slug: 'AbCdE12345', company: 'Rotaport' }, settings: defaultSettings, baseUrl: 'https://raven.example.com', replyTo: 'baturalp@wienerlabs.test', pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' as const } }
    const withNumber = renderEmail({ ...base, whatsappNumber: '+905320000000' })
    expect(withNumber.html).toContain('/r/AbCdE12345/whatsapp?m=tok_1234567890abcdef&amp;s=email')
    expect(withNumber.text).toContain("WhatsApp'tan yazın: https://raven.example.com/r/AbCdE12345/whatsapp")
    const without = renderEmail(base)
    expect(without.html).not.toContain('/whatsapp?')
  })
})

describe('whatsapp inbound', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
    const matrix = [
      ['First Name', 'Last Name', 'Title', 'Company', 'Email', 'Phone'],
      ['Mert', 'Kaya', 'CTO', 'Rotaport', 'mert@rotaport.com.tr', ''],
      ['Ayşe', 'Demir', 'COO', 'Lojix', 'ayse@lojix.com.tr', '+90 532 111 22 33'],
    ]
    await importContacts(db, rowsFromMatrix(matrix).rows, 'test.xlsx')
    for (const contact of await db.select().from(contacts)) await savePitch(db, contact.id, pitchFor(contact.firstName, contact.company), { source: 'import', warnings: [], approve: true })
  })

  afterEach(async () => {
    await handle.close()
  })

  async function contactNamed(firstName: string) {
    const [row] = await db.select().from(contacts).where(eq(contacts.firstName, firstName))
    return row
  }

  it('keeps a reference code sender unverified until someone links the number', async () => {
    const mert = await contactNamed('Mert')
    const text = clickToChatText({ language: 'tr', company: 'Rotaport', solution: 'Rota Asistanı', slug: mert.slug })
    const summary = await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'wamid.1', status: null, from: '905559998877', text, timestamp: 1_790_000_000 }])
    expect(summary).toMatchObject({ received: 0, unverified: 1, ignored: 0 })
    expect(summary.notices[0]).toMatchObject({ verified: false, from: '+905559998877' })
    const untouched = await contactNamed('Mert')
    expect(untouched.phone).toBeNull()
    expect(untouched.whatsappOptIn).toBe(false)
    expect(untouched.stage).toBe('new')
    const [response] = await db.select().from(responses).where(eq(responses.contactId, mert.id))
    expect(response).toMatchObject({ channel: 'whatsapp', kind: 'reply', fromAddress: '+905559998877' })
    expect(await linkWhatsappSender(db, mert.id)).toEqual({ ok: true, phone: '+905559998877' })
    const linked = await contactNamed('Mert')
    expect(linked).toMatchObject({ phone: '+905559998877', whatsappOptIn: true, stage: 'replied' })
    const next = await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'wamid.1b', status: null, from: '905559998877', text: 'Salı uygun', timestamp: null }])
    expect(next).toMatchObject({ received: 1, unverified: 0 })
  })

  it('never lets a reference code overwrite or impersonate a known number', async () => {
    const ayse = await contactNamed('Ayşe')
    const text = clickToChatText({ language: 'tr', company: 'Lojix', solution: 'Rota Asistanı', slug: ayse.slug })
    const summary = await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'wamid.x', status: null, from: '905550001122', text, timestamp: null }])
    expect(summary).toMatchObject({ unverified: 1, received: 0 })
    const after = await contactNamed('Ayşe')
    expect(after.phone).toBe('+905321112233')
    expect(after.stage).toBe('new')
    expect(await linkWhatsappSender(db, ayse.id)).toEqual({ ok: false, reason: 'has-phone' })
    const stop = await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'wamid.y', status: null, from: '905550001122', text: `DUR ${text}`, timestamp: null }])
    expect(stop.stopped).toBe(1)
    expect(await db.select().from(suppressions).where(eq(suppressions.value, '+905550001122'))).toHaveLength(1)
    expect(await db.select().from(suppressions).where(eq(suppressions.value, '+905321112233'))).toHaveLength(0)
    expect((await contactNamed('Ayşe')).stage).toBe('new')
  })

  it('ignores repeated deliveries and unknown senders', async () => {
    const ayse = await contactNamed('Ayşe')
    const message = { kind: 'message' as const, providerId: 'wamid.2', status: null, from: '905321112233', text: 'Merhaba, detay alabilir miyim?', timestamp: null }
    await handleWhatsappEvents(db, [message])
    const again = await handleWhatsappEvents(db, [message, { ...message, providerId: 'wamid.3', from: '905000000001', text: 'kimsin' }])
    expect(again).toMatchObject({ duplicates: 1, ignored: 1, received: 0 })
    expect(await db.select().from(responses).where(eq(responses.contactId, ayse.id))).toHaveLength(1)
    expect((await contactNamed('Ayşe')).whatsappOptIn).toBe(true)
  })

  it('stops messaging when someone writes DUR', async () => {
    const summary = await handleWhatsappEvents(db, [{ kind: 'message', providerId: 'wamid.4', status: null, from: '905321112233', text: 'DUR', timestamp: null }])
    expect(summary.stopped).toBe(1)
    expect(await db.select().from(suppressions).where(eq(suppressions.value, '+905321112233'))).toHaveLength(1)
    expect((await contactNamed('Ayşe')).stage).toBe('unsubscribed')
  })

  it('records delivery and read receipts for sent templates', async () => {
    const ayse = await contactNamed('Ayşe')
    const [message] = await db.insert(messages).values({ token: 'tok_whatsapp_0000001', contactId: ayse.id, channel: 'whatsapp', status: 'sent', providerId: 'wamid.sent' }).returning()
    const summary = await handleWhatsappEvents(db, [{ kind: 'status', providerId: 'wamid.sent', status: 'read', from: '905321112233', text: null, timestamp: null }])
    expect(summary.statuses).toBe(1)
    expect(await db.select().from(events).where(eq(events.messageId, message.id))).toHaveLength(1)
  })

  it('stores the access token sealed and keeps it when the field is left empty', async () => {
    await saveWhatsappSettings(db, { businessNumber: '0532 000 00 00', autoSend: true, phoneNumberId: '1234', wabaId: '5678', templateName: 'raven_intro', token: 'EAAG-secret', appSecret: 'app-secret' })
    const stored = await getStoredWhatsapp(db)
    expect(stored.tokenSealed).not.toContain('EAAG')
    expect(stored.verifyToken.length).toBeGreaterThan(20)
    await saveWhatsappSettings(db, { businessNumber: '+905320000000', autoSend: true, phoneNumberId: '1234', wabaId: '5678', templateName: 'raven_intro', token: '', appSecret: '' })
    const resolved = await resolveWhatsapp(db, {} as NodeJS.ProcessEnv)
    expect(resolved.cloud?.token).toBe('EAAG-secret')
    expect(resolved.appSecret).toBe('app-secret')
    expect(resolved.businessNumber).toBe('+905320000000')
    expect(resolved.mode).toBe('cloud')
    await saveWhatsappSettings(db, { businessNumber: '', autoSend: false, phoneNumberId: '1234', wabaId: '', templateName: 'raven_intro', token: '', appSecret: '', clearToken: true })
    const cleared = await resolveWhatsapp(db, {} as NodeJS.ProcessEnv)
    expect(cleared.cloud).toBeNull()
    expect(cleared.businessNumber).toBeNull()
    expect(cleared.mode).toBe('manual')
  })
})
