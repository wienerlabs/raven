export function normalizePhone(raw: string | number | null | undefined, defaultCountry = '90'): string | null {
  if (raw === null || raw === undefined) return null
  const input = String(raw).trim()
  if (!input) return null
  const hasPlus = input.startsWith('+')
  let digits = input.replace(/\D+/g, '')
  if (!digits) return null
  if (hasPlus) return validLength(digits) ? `+${digits}` : null
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
    return validLength(digits) ? `+${digits}` : null
  }
  if (defaultCountry === '90') {
    if (digits.length === 12 && digits.startsWith('90')) return `+${digits}`
    if (digits.length === 11 && digits.startsWith('0')) return `+90${digits.slice(1)}`
    if (digits.length === 10 && /^[2-5]/.test(digits)) return `+90${digits}`
  }
  if (digits.length === 11 && digits.startsWith('0')) return `+${defaultCountry}${digits.slice(1)}`
  return validLength(digits) && digits.length >= 11 ? `+${digits}` : null
}

function validLength(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15
}

export function whatsappDigits(e164: string): string {
  return e164.replace(/\D+/g, '')
}

export function isTurkishMobile(e164: string | null | undefined): boolean {
  return Boolean(e164 && /^\+905\d{9}$/.test(e164))
}

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return ''
  const match = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164)
  if (match) return `+90 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`
  return e164
}
