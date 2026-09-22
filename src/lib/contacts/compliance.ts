import { isGenericMailbox } from './names'

const sanctionedTlds = ['ir', 'ru', 'by', 'kp', 'sy', 'cu']
const reviewTlds = ['ca']
const holdFlags = new Set(['sanctions-review', 'jurisdiction-review'])

export interface ComplianceResult {
  flags: string[]
  holdReason: string | null
}

function tld(domain: string | null): string {
  if (!domain) return ''
  return domain.toLowerCase().split('.').pop() ?? ''
}

export function assessCompliance(input: { email: string | null; domain: string | null; company: string; title: string | null }): ComplianceResult {
  const flags = new Set<string>()
  const top = tld(input.domain)
  if (sanctionedTlds.includes(top) || /[Ѐ-ӿ]/.test(input.company)) flags.add('sanctions-review')
  if (reviewTlds.includes(top)) flags.add('jurisdiction-review')
  if (isGenericMailbox(input.email)) flags.add('generic-mailbox')
  if (!input.title || /^none$/i.test(input.title.trim())) flags.add('title-missing')
  return { flags: [...flags], holdReason: holdReasonFor([...flags]) }
}

export function holdReasonFor(flags: string[]): string | null {
  if (flags.includes('sanctions-review')) return 'Yaptırım riski: ülke veya şirket bağlantısı hukuki inceleme gerektiriyor'
  if (flags.includes('jurisdiction-review')) return 'Onay gerektiren yargı alanı (Kanada CASL veya ABD): gönderim öncesi inceleyin'
  return null
}

export function needsHold(flags: string[]): boolean {
  return flags.some((flag) => holdFlags.has(flag))
}
