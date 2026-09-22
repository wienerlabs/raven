import { describe, expect, it } from 'vitest'
import { examplePitch } from '@/lib/ai/prompt'
import { checkPitch } from '@/lib/pitch/validate'
import { foldName, namesMatch } from '@/lib/text/fold'

const context = { firstName: 'Mert', lastName: 'Kaya', email: 'mert@rotaport.com.tr', company: 'Rotaport' }

function variant(mutate: (pitch: typeof examplePitch) => void) {
  const copy = structuredClone(examplePitch)
  mutate(copy)
  return copy
}

describe('pitch validation', () => {
  it('accepts the reference example without warnings', () => {
    const result = checkPitch(examplePitch, context)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('rejects em dashes anywhere', () => {
    const result = checkPitch(variant((pitch) => (pitch.email.body = `${pitch.email.body} — kesin`)), context)
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('em dash')
  })

  it('rejects exclamation marks, emoji and spam words', () => {
    expect(checkPitch(variant((pitch) => (pitch.email.cta = 'Hemen görüşelim, harika olur!')), context).ok).toBe(false)
    expect(checkPitch(variant((pitch) => (pitch.email.ps = 'Sizin için hazırladık \u{1F680} bir bakın lütfen')), context).ok).toBe(false)
    expect(checkPitch(variant((pitch) => (pitch.email.subject = 'Ücretsiz pilot teklifimiz hazır')), context).ok).toBe(false)
  })

  it('rejects crypto solutions', () => {
    const result = checkPitch(variant((pitch) => (pitch.solution.name = 'Blockchain Asistanı')), context)
    expect(result.errors.join(' ')).toContain('crypto')
  })

  it('requires the whatsapp link placeholder exactly once', () => {
    expect(checkPitch(variant((pitch) => (pitch.whatsapp = pitch.whatsapp.replace('{link}', ''))), context).ok).toBe(false)
  })

  it('rejects gendered honorifics and wrong names', () => {
    expect(checkPitch(variant((pitch) => (pitch.person.salutation = 'Merhaba Mert Bey,')), context).ok).toBe(false)
    const renamed = checkPitch(
      variant((pitch) => {
        pitch.person.firstName = 'Ahmet'
        pitch.person.greetingName = 'Ahmet'
        pitch.person.salutation = 'Merhaba Ahmet,'
      }),
      context,
    )
    expect(renamed.ok).toBe(false)
  })

  it('allows a greeting name taken from the email when flagged', () => {
    const result = checkPitch(
      variant((pitch) => {
        pitch.person.greetingName = 'Bora'
        pitch.person.salutation = 'Merhaba Bora,'
        pitch.flags = ['name-from-email']
      }),
      context,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects deceptive reply prefixes in subjects', () => {
    expect(checkPitch(variant((pitch) => (pitch.email.subject = 'Re: Rotaport görüşmemiz')), context).ok).toBe(false)
  })

  it('matches transliterated Turkish names', () => {
    expect(namesMatch('Gökhan', 'Goekhan')).toBe(true)
    expect(namesMatch('Tüzün', 'Tuezuen')).toBe(true)
    expect(namesMatch('Sarıhan', 'Sarihan')).toBe(true)
    expect(namesMatch('Çağrı', 'Cagri')).toBe(true)
    expect(namesMatch('Ahmet', 'Mehmet')).toBe(false)
    expect(foldName('İsmail')).toBe('ismail')
  })
})
