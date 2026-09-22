import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isStopWord, parseWhatsappWebhook, templatePayload, verifyMetaSignature, waMeLink } from '@/lib/channels/whatsapp'
import { createSessionValue, randomSlug, randomToken, verifySessionValue } from '@/lib/security/tokens'

describe('session tokens', () => {
  const secret = 'x'.repeat(40)

  it('accepts a valid session and rejects tampering or expiry', () => {
    const value = createSessionValue(secret, 60, 1_000_000)
    expect(verifySessionValue(value, secret, 1_000_000)).toBe(true)
    expect(verifySessionValue(value, 'y'.repeat(40), 1_000_000)).toBe(false)
    expect(verifySessionValue(`${value}x`, secret, 1_000_000)).toBe(false)
    expect(verifySessionValue(value, secret, 1_000_000 + 61_000)).toBe(false)
    expect(verifySessionValue(undefined, secret)).toBe(false)
  })

  it('creates random tokens and slugs', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(randomSlug(10)).toMatch(/^[A-Za-z0-9]{10}$/)
    expect(randomToken()).not.toBe(randomToken())
  })
})

describe('whatsapp', () => {
  it('builds click to chat links', () => {
    expect(waMeLink('+905321234567', 'Merhaba Mert')).toBe('https://wa.me/905321234567?text=Merhaba%20Mert')
  })

  it('builds a template payload with a url button suffix', () => {
    const payload = templatePayload({ to: '+905321234567', greetingName: 'Mert', company: 'Rotaport', solution: 'Rota\nAsistanı', buttonSuffix: 'abc?m=t&s=wa', language: 'tr' }, 'raven_intro')
    expect(payload.to).toBe('905321234567')
    expect(payload.template.components[0].parameters[2]).toEqual({ type: 'text', text: 'Rota Asistanı' })
    expect(payload.template.components[1]).toMatchObject({ type: 'button', sub_type: 'url', index: '0' })
  })

  it('verifies meta signatures', () => {
    const body = JSON.stringify({ hello: 'world' })
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`
    expect(verifyMetaSignature(body, signature, 'app-secret')).toBe(true)
    expect(verifyMetaSignature(body, signature, 'other')).toBe(false)
    expect(verifyMetaSignature(body, null, 'app-secret')).toBe(false)
  })

  it('parses webhook statuses and messages', () => {
    const events = parseWhatsappWebhook({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read', recipient_id: '905321234567' }], messages: [{ id: 'wamid.2', from: '905321234567', type: 'text', text: { body: 'DUR' } }] } }] }],
    })
    expect(events).toHaveLength(2)
    expect(events[1].text).toBe('DUR')
    expect(isStopWord('DUR')).toBe(true)
    expect(isStopWord('Durumu nedir')).toBe(false)
  })
})
