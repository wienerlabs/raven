import { describe, expect, it } from 'vitest'
import { addBusinessDays, defaultCampaignConfig, inWindow, localDayKey, localParts, nextWindowStart, planSlots } from '@/lib/campaign/schedule'

const config = { ...defaultCampaignConfig, minGapSeconds: 60, maxGapSeconds: 60 }

describe('schedule', () => {
  it('reads local Istanbul time', () => {
    const parts = localParts(new Date('2026-09-23T06:30:00Z'), 'Europe/Istanbul')
    expect(parts.hour).toBe(9)
    expect(parts.minute).toBe(30)
    expect(parts.weekday).toBe(3)
  })

  it('keeps a time that is already inside the window', () => {
    const at = new Date('2026-09-23T07:00:00Z')
    expect(inWindow(at, config)).toBe(true)
    expect(nextWindowStart(at, config).toISOString()).toBe(at.toISOString())
  })

  it('moves early morning to the window start', () => {
    expect(nextWindowStart(new Date('2026-09-23T03:12:00Z'), config).toISOString()).toBe('2026-09-23T06:00:00.000Z')
  })

  it('moves evenings and weekends to the next business morning', () => {
    expect(nextWindowStart(new Date('2026-09-25T16:30:00Z'), config).toISOString()).toBe('2026-09-28T06:00:00.000Z')
    expect(nextWindowStart(new Date('2026-09-26T10:00:00Z'), config).toISOString()).toBe('2026-09-28T06:00:00.000Z')
  })

  it('adds business days and lands inside the window', () => {
    const result = addBusinessDays(new Date('2026-09-24T08:00:00Z'), 3, config)
    expect(localParts(result, config.timezone).weekday).toBe(2)
    expect(inWindow(result, config)).toBe(true)
  })

  it('respects daily limits and spreads across senders', () => {
    const slots = planSlots({
      count: 7,
      senders: [
        { id: 'a', dailyLimit: 2 },
        { id: 'b', dailyLimit: 2 },
      ],
      start: new Date('2026-09-23T07:00:00Z'),
      config,
      random: () => 0,
    })
    expect(slots).toHaveLength(7)
    const byDay = new Map<string, number>()
    for (const slot of slots) {
      const key = `${slot.senderId}:${localDayKey(slot.at, config.timezone)}`
      byDay.set(key, (byDay.get(key) ?? 0) + 1)
      expect(inWindow(slot.at, config)).toBe(true)
    }
    for (const count of byDay.values()) expect(count).toBeLessThanOrEqual(2)
    expect(slots.filter((slot) => localDayKey(slot.at, config.timezone) === '2026-09-23')).toHaveLength(4)
  })

  it('keeps the configured gap between two sends of one sender', () => {
    const slots = planSlots({ count: 3, senders: [{ id: 'a', dailyLimit: 50 }], start: new Date('2026-09-23T07:00:00Z'), config, random: () => 0 })
    expect(slots[1].at.getTime() - slots[0].at.getTime()).toBe(60_000)
    expect(slots[2].at.getTime() - slots[1].at.getTime()).toBe(60_000)
  })

  it('counts existing usage for the day', () => {
    const slots = planSlots({
      count: 1,
      senders: [{ id: 'a', dailyLimit: 1, usedByDay: { '2026-09-23': 1 } }],
      start: new Date('2026-09-23T07:00:00Z'),
      config,
      random: () => 0,
    })
    expect(localDayKey(slots[0].at, config.timezone)).toBe('2026-09-24')
  })
})
