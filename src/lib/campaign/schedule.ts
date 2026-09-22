import type { CampaignConfig } from '@/lib/db/schema'

export type WindowConfig = Pick<CampaignConfig, 'timezone' | 'windowStartHour' | 'windowEndHour' | 'weekdays'>

export interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  weekday: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const weekdayIndex: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function formatter(timezone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timezone)
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timezone, cached)
  }
  return cached
}

export function localParts(date: Date, timezone: string): LocalParts {
  const parts = formatter(timezone).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0'
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: weekdayIndex[get('weekday')] ?? 1,
  }
}

export function localDayKey(date: Date, timezone: string): string {
  const parts = localParts(date, timezone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function inWindow(date: Date, config: WindowConfig): boolean {
  const parts = localParts(date, config.timezone)
  const minutes = parts.hour * 60 + parts.minute
  return config.weekdays.includes(parts.weekday) && minutes >= config.windowStartHour * 60 && minutes < config.windowEndHour * 60
}

export function startOfNextLocalDay(date: Date, timezone: string): Date {
  const parts = localParts(date, timezone)
  const elapsed = (parts.hour * 3600 + parts.minute * 60 + parts.second) * 1000 + date.getUTCMilliseconds()
  return new Date(date.getTime() - elapsed + 24 * 3600 * 1000)
}

export function nextWindowStart(date: Date, config: WindowConfig): Date {
  let cursor = new Date(date.getTime())
  for (let guard = 0; guard < 400; guard++) {
    const parts = localParts(cursor, config.timezone)
    const minutes = parts.hour * 60 + parts.minute
    const allowedDay = config.weekdays.includes(parts.weekday)
    if (allowedDay && minutes >= config.windowStartHour * 60 && minutes < config.windowEndHour * 60) return cursor
    if (allowedDay && minutes < config.windowStartHour * 60) {
      cursor = new Date(cursor.getTime() + (config.windowStartHour * 60 - minutes) * 60_000 - parts.second * 1000 - cursor.getUTCMilliseconds())
      continue
    }
    cursor = startOfNextLocalDay(cursor, config.timezone)
  }
  return cursor
}

export function addBusinessDays(date: Date, days: number, config: WindowConfig): Date {
  let cursor = new Date(date.getTime())
  let remaining = days
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + 24 * 3600 * 1000)
    if (config.weekdays.includes(localParts(cursor, config.timezone).weekday)) remaining -= 1
  }
  return nextWindowStart(cursor, config)
}

export interface SenderCapacity {
  id: string
  dailyLimit: number
  usedByDay?: Record<string, number>
}

export interface PlannedSlot {
  senderId: string
  at: Date
}

interface Cursor {
  id: string
  limit: number
  at: Date
  used: Map<string, number>
}

export function planSlots(options: {
  count: number
  senders: SenderCapacity[]
  start: Date
  config: CampaignConfig
  random?: () => number
}): PlannedSlot[] {
  const { config } = options
  const random = options.random ?? Math.random
  if (options.senders.length === 0 || options.count <= 0) return []
  const cursors: Cursor[] = options.senders.map((sender) => ({
    id: sender.id,
    limit: Math.max(1, Math.min(sender.dailyLimit, config.dailyLimitPerSender)),
    at: nextWindowStart(options.start, config),
    used: new Map(Object.entries(sender.usedByDay ?? {})),
  }))
  const ensureCapacity = (cursor: Cursor) => {
    for (let guard = 0; guard < 400; guard++) {
      const key = localDayKey(cursor.at, config.timezone)
      if ((cursor.used.get(key) ?? 0) < cursor.limit) return
      cursor.at = nextWindowStart(startOfNextLocalDay(cursor.at, config.timezone), config)
    }
  }
  const slots: PlannedSlot[] = []
  for (let index = 0; index < options.count; index++) {
    let best: Cursor | null = null
    for (const cursor of cursors) {
      ensureCapacity(cursor)
      if (!best || cursor.at.getTime() < best.at.getTime()) best = cursor
    }
    if (!best) break
    slots.push({ senderId: best.id, at: best.at })
    const key = localDayKey(best.at, config.timezone)
    best.used.set(key, (best.used.get(key) ?? 0) + 1)
    const gap = config.minGapSeconds + random() * Math.max(0, config.maxGapSeconds - config.minGapSeconds)
    best.at = nextWindowStart(new Date(best.at.getTime() + gap * 1000), config)
  }
  return slots
}

export const defaultCampaignConfig: CampaignConfig = {
  timezone: 'Europe/Istanbul',
  windowStartHour: 9,
  windowEndHour: 18,
  weekdays: [1, 2, 3, 4, 5],
  minGapSeconds: 75,
  maxGapSeconds: 210,
  dailyLimitPerSender: 80,
  followUpDays: [3, 4],
  followUpsEnabled: true,
  subjectTest: true,
  bounceGuardMinSent: 20,
  bounceGuardMaxRate: 0.06,
}
