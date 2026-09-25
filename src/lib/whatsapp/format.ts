const TIMEZONE = 'Europe/Istanbul'

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
const clock = new Intl.DateTimeFormat('tr-TR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat('tr-TR', { timeZone: TIMEZONE, weekday: 'short' })
const shortDay = new Intl.DateTimeFormat('tr-TR', { timeZone: TIMEZONE, day: 'numeric', month: 'short' })
const longDay = new Intl.DateTimeFormat('tr-TR', { timeZone: TIMEZONE, day: 'numeric', month: 'long', weekday: 'long' })

const DAY_MS = 24 * 60 * 60 * 1000

export function localDayKey(at: Date): string {
  return dayKey.format(at)
}

function daysBetween(at: Date, now: Date): number {
  const [a, b] = [localDayKey(at), localDayKey(now)].map((value) => Date.parse(`${value}T00:00:00Z`))
  return Math.round((b - a) / DAY_MS)
}

export function clockTime(at: Date): string {
  return clock.format(at)
}

export function listTime(at: Date, now: Date): string {
  const days = daysBetween(at, now)
  if (days <= 0) return clockTime(at)
  if (days === 1) return 'Dün'
  if (days < 7) return weekday.format(at)
  return shortDay.format(at)
}

export function dayLabel(at: Date, now: Date): string {
  const days = daysBetween(at, now)
  if (days <= 0) return 'Bugün'
  if (days === 1) return 'Dün'
  return longDay.format(at)
}

export function remaining(ms: number): string {
  if (ms <= 0) return 'kapandı'
  const minutes = Math.max(1, Math.floor(ms / 60000))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} dk`
  const rest = minutes % 60
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`
}

export function remainingShort(ms: number): string {
  if (ms <= 0) return 'kapandı'
  const minutes = Math.max(1, Math.floor(ms / 60000))
  return minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes / 60)} sa`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts).map((part) => part.charAt(0).toLocaleUpperCase('tr'))
  return letters.join('') || '?'
}

export function threadMatches(fields: { name: string; company: string; from: string | null }, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('tr')
  if (!needle) return true
  if ([fields.name, fields.company, fields.from ?? ''].some((value) => value.toLocaleLowerCase('tr').includes(needle))) return true
  const digits = needle.replace(/\D/g, '')
  return digits.length >= 3 && (fields.from ?? '').replace(/\D/g, '').includes(digits)
}

export type FilterKey = 'all' | 'waiting' | 'unverified'

export const inboxFilters: Array<{ key: FilterKey; label: string; param: string | null }> = [
  { key: 'all', label: 'Tümü', param: null },
  { key: 'waiting', label: 'Bekleyen', param: 'bekleyen' },
  { key: 'unverified', label: 'Doğrulanmamış', param: 'dogrulanmamis' },
]

export function filterFromParam(value: unknown): FilterKey {
  return inboxFilters.find((item) => item.param !== null && item.param === value)?.key ?? 'all'
}

export function inboxHref(filter: FilterKey, contactId?: string | null): string {
  const params = new URLSearchParams()
  const param = inboxFilters.find((item) => item.key === filter)?.param
  if (param) params.set('filtre', param)
  if (contactId) params.set('kisi', contactId)
  const query = params.toString()
  return query ? `/whatsapp?${query}` : '/whatsapp'
}
