import { describe, expect, it } from 'vitest'
import { dayLabel, filterFromParam, inboxHref, initials, listTime, remaining, remainingShort, threadMatches } from '@/lib/whatsapp/format'
import { templateText } from '@/lib/channels/whatsapp'

describe('whatsapp inbox formatting', () => {
  const now = new Date('2026-09-25T09:00:00Z')

  it('labels times the way a chat list does, in Istanbul time', () => {
    expect(listTime(new Date('2026-09-25T06:05:00Z'), now)).toBe('09:05')
    expect(listTime(new Date('2026-09-24T20:00:00Z'), now)).toBe('Dün')
    expect(listTime(new Date('2026-09-24T21:30:00Z'), now)).toBe('00:30')
    expect(listTime(new Date('2026-09-21T10:00:00Z'), now)).toMatch(/^Pzt/)
    expect(listTime(new Date('2026-09-01T10:00:00Z'), now)).toBe('1 Eyl')
    expect(dayLabel(new Date('2026-09-25T01:00:00Z'), now)).toBe('Bugün')
    expect(dayLabel(new Date('2026-09-24T01:00:00Z'), now)).toBe('Dün')
    expect(dayLabel(new Date('2026-09-20T10:00:00Z'), now)).toBe('20 Eylül Pazar')
  })

  it('counts down the reply window', () => {
    expect(remaining(0)).toBe('kapandı')
    expect(remaining(30 * 1000)).toBe('1 dk')
    expect(remaining(42 * 60 * 1000)).toBe('42 dk')
    expect(remaining(3 * 60 * 60 * 1000)).toBe('3 sa')
    expect(remaining((5 * 60 + 12) * 60 * 1000)).toBe('5 sa 12 dk')
    expect(remainingShort((5 * 60 + 12) * 60 * 1000)).toBe('5 sa')
    expect(remainingShort(42 * 60 * 1000)).toBe('42 dk')
    expect(remainingShort(-1)).toBe('kapandı')
  })

  it('matches threads by name, company and digits', () => {
    const thread = { name: 'Ayşe Işık', company: 'Lojix', from: '+905321112233' }
    expect(threadMatches(thread, 'IŞIK')).toBe(true)
    expect(threadMatches(thread, 'lojix')).toBe(true)
    expect(threadMatches(thread, '532 111')).toBe(true)
    expect(threadMatches(thread, '999')).toBe(false)
    expect(threadMatches(thread, 'rotaport')).toBe(false)
    expect(initials('ayşe ışık')).toBe('AI')
    expect(initials('İlker')).toBe('İ')
  })

  it('builds inbox links and reads filters safely', () => {
    expect(inboxHref('all')).toBe('/whatsapp')
    expect(inboxHref('waiting', 'abc')).toBe('/whatsapp?filtre=bekleyen&kisi=abc')
    expect(filterFromParam('dogrulanmamis')).toBe('unverified')
    expect(filterFromParam(['bekleyen'])).toBe('all')
    expect(filterFromParam(undefined)).toBe('all')
  })

  it('renders the approved template the way the recipient saw it', () => {
    const text = templateText('tr', { greetingName: 'Mert', company: 'Rotaport', solution: 'Rota Asistanı' })
    expect(text).toContain('Merhaba Mert, Rotaport için')
    expect(text).toContain(': Rota Asistanı.')
    expect(text).not.toMatch(/\{\{\d\}\}/)
    expect(templateText('en', { greetingName: 'Ada', company: 'Acme', solution: 'Route\nBot' })).toContain('for Acme: Route Bot.')
  })
})
