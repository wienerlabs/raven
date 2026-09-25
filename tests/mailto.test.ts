import { describe, expect, it } from 'vitest'
import { mailtoHref } from '@/lib/email/mailto'

describe('mailto links', () => {
  it('builds encoded links for plain addresses', () => {
    expect(mailtoHref('deniz.aksoy@example.com', { subject: 'Rota Asistanı hakkında', body: 'Merhaba Deniz,\nsalı uygun.' })).toBe('mailto:deniz.aksoy@example.com?subject=Rota%20Asistan%C4%B1%20hakk%C4%B1nda&body=Merhaba%20Deniz%2C%0Asal%C4%B1%20uygun.')
    expect(mailtoHref(' ece+satis@pera-mimarlik.com.tr ')).toBe('mailto:ece+satis@pera-mimarlik.com.tr')
  })

  it('refuses addresses that could smuggle extra headers', () => {
    expect(mailtoHref('a@b.com?bcc=spy@evil.com')).toBeNull()
    expect(mailtoHref('a@b.com&cc=spy@evil.com')).toBeNull()
    expect(mailtoHref('a@b.com%0Abcc:spy@evil.com')).toBeNull()
    expect(mailtoHref('javascript:alert(1)//@x.com')).toBeNull()
    expect(mailtoHref('two words@example.com')).toBeNull()
    expect(mailtoHref(null)).toBeNull()
    expect(mailtoHref('')).toBeNull()
  })
})
