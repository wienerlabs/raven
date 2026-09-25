import { describe, expect, it } from 'vitest'
import { aiFailure } from '@/lib/ai/client'
import type Anthropic from '@anthropic-ai/sdk'
import { buildReplyPrompt, cleanDraft, draftReply, type ReplyContext } from '@/lib/ai/reply'
import { checkSnippets, defaultSnippets, renderSnippet } from '@/lib/whatsapp/snippets'

const longDash = String.fromCharCode(0x2014)
const shortDash = String.fromCharCode(0x2013)
const party = String.fromCodePoint(0x1f389)

const context: ReplyContext = {
  channel: 'whatsapp',
  language: 'tr',
  sender: { fullName: 'Baturalp Güvenç', firstName: 'Baturalp', title: 'Kurucu', company: 'Wiener Labs' },
  contact: { greetingName: 'Mert', fullName: 'Mert Kaya', company: 'Rotaport', title: 'CTO' },
  solution: { name: 'Rota Asistanı', tagline: 'Sevkiyat planını dakikalar içinde çıkaran AI katmanı', problem: 'Planlama elle ve yavaş yapılıyor.', steps: ['Veri: sipariş akışı okunur', 'Plan: rota önerilir', 'Onay: planlayıcı onaylar'], pilot: '2 hafta, tek depo', kpis: ['Planlama süresi yarıya iner'] },
  calendarUrl: 'https://cal.example.com/baturalp',
  briefUrl: 'https://raven.example.com/r/AbCdE12345',
  conversation: [
    { direction: 'out', text: 'Merhaba Mert, Rotaport için bir taslak hazırladık.', at: new Date('2026-09-20T09:00:00Z') },
    { direction: 'in', text: 'Merhaba, bu hafta konuşabiliriz.', at: new Date('2026-09-21T09:00:00Z') },
  ],
}

describe('reply drafts', () => {
  it('strips dashes, emoji, exclamation marks and wrapping quotes', () => {
    const raw = `"Harika${party}! Salı uygun mu ${longDash} ya da çarşamba ${shortDash} öğleden sonra?"`
    const cleaned = cleanDraft(raw, 'whatsapp')
    expect(cleaned).not.toContain(longDash)
    expect(cleaned).not.toContain(shortDash)
    expect(cleaned).not.toContain('!')
    expect(cleaned).not.toContain(party)
    expect(cleaned.startsWith('"')).toBe(false)
    expect(cleaned).toBe('Harika. Salı uygun mu, ya da çarşamba, öğleden sonra?')
  })

  it('keeps drafts within the channel limit at a sentence boundary', () => {
    const long = Array.from({ length: 40 }, (_, index) => `Cümle numarası ${index} burada bitiyor.`).join(' ')
    const cleaned = cleanDraft(long, 'whatsapp')
    expect(cleaned.length).toBeLessThanOrEqual(700)
    expect(cleaned.endsWith('.')).toBe(true)
  })

  it('grounds the prompt in the solution, links and conversation', () => {
    const prompt = buildReplyPrompt(context)
    expect(prompt.system).toContain('Write in Turkish')
    expect(prompt.system).toContain('Channel: WhatsApp')
    expect(prompt.system).toContain('Never use em dashes')
    expect(prompt.user).toContain('Rota Asistanı')
    expect(prompt.user).toContain('https://cal.example.com/baturalp')
    expect(prompt.user).toContain('https://raven.example.com/r/AbCdE12345')
    expect(prompt.user).toContain('Mert: Merhaba, bu hafta konuşabiliriz.')
    expect(buildReplyPrompt({ ...context, channel: 'email', language: 'en' }).system).toContain('Channel: email reply')
  })

  it('returns a cleaned draft from the model response', async () => {
    const create = async (params: Anthropic.MessageCreateParamsNonStreaming) => {
      expect(params.model).toBe('test-model')
      return { content: [{ type: 'text', text: `Merhaba Mert${longDash} salı 14.00 uygun mu!` }] } as unknown as Anthropic.Message
    }
    const draft = await draftReply(context, { model: 'test-model', create })
    expect(draft).toEqual({ text: 'Merhaba Mert, salı 14.00 uygun mu.', model: 'test-model' })
  })
})

describe('snippets', () => {
  it('fills Turkish placeholders and drops empty ones cleanly', () => {
    const body = defaultSnippets[0].body
    expect(renderSnippet(body, { ad: 'Mert', takvim: 'https://cal.example.com/b' })).toBe('Merhaba Mert, ilginiz için teşekkürler. Bu hafta 20 dakikalık kısa bir görüşme için size uygun iki saat paylaşabilir misiniz? https://cal.example.com/b')
    expect(renderSnippet(body, { ad: 'Mert' }).endsWith('misiniz?')).toBe(true)
    expect(renderSnippet('{çözüm} için taslak: {taslak}', { çözüm: 'Rota Asistanı', taslak: 'https://x.test/r/a' })).toBe('Rota Asistanı için taslak: https://x.test/r/a')
  })

  it('validates titles, bodies, dashes and ids', () => {
    expect(checkSnippets([{ title: 'Selam', body: 'Merhaba {ad}' }])).toEqual({ ok: true, items: [{ id: 'y1', title: 'Selam', body: 'Merhaba {ad}' }] })
    expect(checkSnippets([{ title: 'A', body: 'Merhaba' }]).ok).toBe(false)
    expect(checkSnippets([{ title: 'Tire', body: `Merhaba ${longDash} nasılsınız` }]).ok).toBe(false)
    expect(checkSnippets([{ title: '', body: '' }, { id: 'x', title: 'Bir', body: 'İki' }, { id: 'x', title: 'Üç', body: 'Dört' }])).toMatchObject({ ok: true, items: [{ id: 'x' }, { id: 'x-3' }] })
    expect(checkSnippets(Array.from({ length: 21 }, (_, index) => ({ title: `Başlık ${index}`, body: 'Metin' }))).ok).toBe(false)
  })
})

describe('ai failure messages', () => {
  it('turns provider errors into plain Turkish guidance', () => {
    expect(aiFailure(Object.assign(new Error('401 {"type":"error"}'), { status: 401 }))).toContain('ANTHROPIC_API_KEY')
    expect(aiFailure(Object.assign(new Error('rate'), { status: 429 }))).toContain('sınır')
    expect(aiFailure(Object.assign(new Error('overloaded'), { status: 529 }))).toContain('yoğun')
    expect(aiFailure(new Error('Request timed out.'))).toContain('zaman aşımı')
    expect(aiFailure('boom')).toBe('Taslak üretilemedi. Yeniden deneyin.')
  })
})
