import { describe, expect, it } from 'vitest'
import { classifyInbound, classifyReplyIntent, extractFailedRecipients, extractMessageIds, stripQuoted, wantsUnsubscribe, type InboundMail } from '@/lib/inbox/classify'

const mail = (overrides: Partial<InboundMail>): InboundMail => ({
  from: 'Gökhan <gokhan@kuzeyodeme.com.tr>',
  subject: 'Re: Kuzey Ödeme için kısa bir fikir',
  text: 'Merhaba, görüşelim.',
  inReplyTo: null,
  references: [],
  autoSubmitted: null,
  autoReplyHeader: false,
  contentType: 'text/plain',
  raw: '',
  ...overrides,
})

describe('inbound classification', () => {
  it('detects bounces', () => {
    expect(classifyInbound(mail({ from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', subject: 'Delivery Status Notification (Failure)' }))).toBe('bounce')
    expect(classifyInbound(mail({ from: 'postmaster@outlook.com', subject: 'Undeliverable: x' }))).toBe('bounce')
    expect(classifyInbound(mail({ contentType: 'multipart/report; report-type=delivery-status' }))).toBe('bounce')
  })

  it('detects auto replies', () => {
    expect(classifyInbound(mail({ autoSubmitted: 'auto-replied' }))).toBe('auto_reply')
    expect(classifyInbound(mail({ subject: 'Otomatik yanıt: Kuzey Ödeme için kısa bir fikir' }))).toBe('auto_reply')
    expect(classifyInbound(mail({ subject: 'Out of Office' }))).toBe('auto_reply')
  })

  it('treats normal answers as replies', () => {
    expect(classifyInbound(mail({}))).toBe('reply')
  })

  it('extracts ids and failed recipients', () => {
    expect(extractMessageIds('<abc@wienerlabs.xyz> <def@wienerlabs.xyz> <abc@wienerlabs.xyz>')).toEqual(['<abc@wienerlabs.xyz>', '<def@wienerlabs.xyz>'])
    expect(extractFailedRecipients('Final-Recipient: rfc822; someone@example.com\nAction: failed')).toEqual(['someone@example.com'])
  })

  it('strips quoted history', () => {
    const text = 'Uygunum, perşembe olur.\n\n23 Eyl 2026 Çar 10:12 tarihinde Baturalp Güvenç <b@w.xyz> şunu yazdı:\n> Merhaba'
    expect(stripQuoted(text)).toBe('Uygunum, perşembe olur.')
    expect(stripQuoted('Sounds good\n\nOn Tue, Sep 23, 2026 at 10:12 AM Baturalp wrote:\n> hi')).toBe('Sounds good')
  })

  it('classifies reply intent and unsubscribe wishes', () => {
    expect(classifyReplyIntent('Perşembe için bir toplantı ayarlayalım')).toBe('meeting')
    expect(classifyReplyIntent('Önce biraz daha detay paylaşır mısınız')).toBe('info')
    expect(classifyReplyIntent('Şu an için ihtiyacımız yok, teşekkürler')).toBe('not_interested')
    expect(wantsUnsubscribe('Lütfen beni listeden çıkarın')).toBe(true)
    expect(wantsUnsubscribe('Görüşelim')).toBe(false)
  })
})
