import { describe, expect, it } from 'vitest'
import { renderEmail, renderWhatsapp } from '@/lib/email/render'
import { defaultSettings } from '@/lib/settings'
import { pitchFor } from './fixtures'

const base = {
  contact: { slug: 'AbCdEf1234', company: 'Rotaport' },
  settings: { ...defaultSettings, legal: { ...defaultSettings.legal, address: 'İstanbul' } },
  baseUrl: 'https://raven.example.com/',
  replyTo: 'baturalp@example.com',
}

describe('email rendering', () => {
  it('renders the initial email with brief, quick replies and unsubscribe', () => {
    const email = renderEmail({ ...base, pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' } })
    expect(email.subject).toBe('Rotaport için kısa bir fikir')
    expect(email.html).toContain('https://raven.example.com/r/AbCdEf1234?m=tok_1234567890abcdef')
    expect(email.html).toContain('/r/AbCdEf1234/yanit?n=meeting&amp;m=tok_1234567890abcdef')
    expect(email.html).toContain('https://raven.example.com/u/tok_1234567890abcdef')
    expect(email.html).toContain('Merhaba Mert,')
    expect(email.text).toContain('Size özel taslak: https://raven.example.com/r/AbCdEf1234?m=tok_1234567890abcdef')
    expect(email.headers['List-Unsubscribe']).toBe('<https://raven.example.com/api/unsubscribe/tok_1234567890abcdef>, <mailto:baturalp@example.com?subject=unsubscribe>')
    expect(email.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(email.html).not.toMatch(/[–—]/)
    expect(email.html).not.toContain('/api/track/open/')
  })

  it('uses the alternative subject for variant b', () => {
    const email = renderEmail({ ...base, pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 0, variant: 'b' } })
    expect(email.subject).toBe('Mert, Rotaport için bir taslak')
  })

  it('escapes html in generated content', () => {
    const pitch = pitchFor('Mert', 'Rotaport')
    pitch.email.body = 'Kod <script>alert(1)</script> içerir\n\nİkinci paragraf'
    const email = renderEmail({ ...base, pitch, message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' } })
    expect(email.html).not.toContain('<script>alert(1)</script>')
    expect(email.html).toContain('&lt;script&gt;')
  })

  it('threads follow-ups under the first subject', () => {
    const email = renderEmail({ ...base, pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 1, variant: 'a' }, firstSubject: 'Rotaport için kısa bir fikir' })
    expect(email.subject).toBe('Re: Rotaport için kısa bir fikir')
    expect(email.text).toContain('Geçen hafta Rotaport için')
  })

  it('adds the open pixel only when tracking is enabled', () => {
    const email = renderEmail({ ...base, pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' } }, true)
    expect(email.html).toContain('/api/track/open/tok_1234567890abcdef')
  })

  it('renders whatsapp text with the link and an opt out line', () => {
    const text = renderWhatsapp(pitchFor('Mert', 'Rotaport'), 'https://raven.example.com/r/x?m=y&s=wa')
    expect(text).toContain('https://raven.example.com/r/x?m=y&s=wa')
    expect(text).not.toContain('{link}')
    expect(text).toContain('tekrar yazmamı istemezseniz')
  })
})
