import { describe, expect, it } from 'vitest'
import { assessCompliance, holdReasonFor, needsHold } from '@/lib/contacts/compliance'
import { rowsFromMatrix } from '@/lib/contacts/import'
import { cleanNamePart, nameFromEmail, normalizeFirstName, normalizeLastName } from '@/lib/contacts/names'
import { formatPhone, isTurkishMobile, normalizePhone } from '@/lib/contacts/phone'

describe('names', () => {
  it('fixes transliterated and ascii Turkish names', () => {
    expect(normalizeFirstName('Goekhan')).toBe('Gökhan')
    expect(normalizeFirstName('Cagri')).toBe('Çağrı')
    expect(normalizeFirstName('ISMAIL')).toBe('İsmail')
    expect(normalizeLastName('Tuezuen')).toBe('Tüzün')
    expect(normalizeLastName('Sultanoglu')).toBe('Sultanoğlu')
    expect(normalizeLastName('Hamzaogullari')).toBe('Hamzaoğulları')
  })

  it('drops broken placeholders and derives names from email', () => {
    expect(cleanNamePart('None')).toBe('')
    expect(cleanNamePart('Tr)')).toBe('')
    expect(nameFromEmail('mehmet.ozturk@ornekgrup.com.tr')).toEqual({ first: 'Mehmet', last: 'Öztürk' })
  })
})

describe('phones', () => {
  it('normalizes Turkish numbers to E.164', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('+905321234567')
    expect(normalizePhone('5321234567')).toBe('+905321234567')
    expect(normalizePhone('+90 (532) 123-45-67')).toBe('+905321234567')
    expect(normalizePhone('00905321234567')).toBe('+905321234567')
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizePhone('12')).toBeNull()
    expect(isTurkishMobile('+905321234567')).toBe(true)
    expect(formatPhone('+905321234567')).toBe('+90 532 123 45 67')
  })
})

describe('import mapping', () => {
  it('maps Apollo style exports', () => {
    const { rows, skipped } = rowsFromMatrix([
      ['First Name', 'Last Name', 'Title', 'Company', 'Email', 'Email Status', 'Company Name for Emails'],
      ['Goekhan', 'Yilmaz', 'Chief Technology Officer', 'Kuzey Ödeme Hizmetleri', 'Gokhan.Yilmaz@kuzeyodeme.com.tr', 'Verifying', 'Kuzey Ödeme'],
      ['Mehmet', 'None', 'IT Director', 'Örnek Grup', 'mehmet.ozturk@ornekgrup.com.tr', 'Verifying', 'Örnek Grup'],
      ['', '', '', '', '', '', ''],
      ['Nobody', 'Here', 'CTO', 'X', 'not-an-email', 'Verifying', 'X'],
    ])
    expect(rows).toHaveLength(2)
    expect(skipped).toBe(1)
    expect(rows[0].email).toBe('gokhan.yilmaz@kuzeyodeme.com.tr')
    expect(rows[0].companyForEmails).toBe('Kuzey Ödeme')
    expect(rows[1].lastName).toBe('')
  })

  it('maps Turkish headers, full names and phone only rows', () => {
    const { rows } = rowsFromMatrix([
      ['Ad Soyad', 'Ünvan', 'Şirket', 'Cep Telefonu', 'Mevcut müşteri'],
      ['Ayşe Nur Demir', 'Genel Müdür', 'Demir Lojistik', '0532 111 22 33', 'Evet'],
    ])
    expect(rows[0]).toMatchObject({ firstName: 'Ayşe Nur', lastName: 'Demir', title: 'Genel Müdür', company: 'Demir Lojistik', phone: '+905321112233', email: null, relationship: 'customer' })
  })
})

describe('compliance', () => {
  it('holds sanctioned jurisdictions and flags shared inboxes', () => {
    expect(assessCompliance({ email: 'a@ornekborsa.ir', domain: 'ornekborsa.ir', company: 'Örnek Borsa', title: 'CTO' }).holdReason).not.toBeNull()
    expect(assessCompliance({ email: 'v@x.ru', domain: 'x.ru', company: 'ООО Пример', title: 'CTO' }).flags).toContain('sanctions-review')
    const shared = assessCompliance({ email: 'istanbul@ornekharita.com.tr', domain: 'ornekharita.com.tr', company: 'Örnek Harita', title: 'CTO' })
    expect(shared.flags).toContain('generic-mailbox')
    expect(shared.holdReason).toBeNull()
  })

  it('keeps holds until a person clears the review', () => {
    expect(needsHold(['sanctions-review'])).toBe(true)
    expect(needsHold(['sanctions-review', 'review-cleared'])).toBe(false)
    expect(holdReasonFor(['sanctions-review', 'review-cleared'])).toBeNull()
    expect(needsHold(['generic-mailbox'])).toBe(false)
  })
})
