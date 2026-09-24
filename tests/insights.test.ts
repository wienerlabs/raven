import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { contacts, events, messages, responses } from '@/lib/db/schema'
import { importContacts, rowsFromMatrix } from '@/lib/contacts/import'
import { savePitch } from '@/lib/pitch/store'
import { localDay, responseMix, responsePulse, sectorPerformance } from '@/lib/queries'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

const tz = 'Europe/Istanbul'
const now = new Date('2026-09-23T15:00:00Z')

describe('response insights', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  async function seed() {
    const matrix = [['First Name', 'Last Name', 'Title', 'Company', 'Email']]
    const sectors = ['Lojistik', 'Lojistik', 'Fintek']
    for (let index = 0; index < sectors.length; index++) matrix.push([['Mert', 'Ayşe', 'Can'][index], 'Kaya', 'CTO', `Firma${index}`, `kisi${index}@firma${index}.com.tr`])
    await importContacts(db, rowsFromMatrix(matrix).rows, 'test.xlsx')
    const all = await db.select().from(contacts).orderBy(contacts.email)
    for (let index = 0; index < all.length; index++) {
      const pitch = pitchFor(all[index].firstName, all[index].company)
      pitch.company = { ...pitch.company, sector: sectors[index] }
      await savePitch(db, all[index].id, pitch, { source: 'import', warnings: [], approve: true })
    }
    return all
  }

  it('counts sends, page views, replies and meeting requests per local day', async () => {
    const [first, second, third] = await seed()
    const monday = new Date('2026-09-21T07:30:00Z')
    const tuesday = new Date('2026-09-22T21:30:00Z')
    for (const [index, contact] of [first, second, third].entries()) {
      await db.insert(messages).values({ token: `t${index}`, contactId: contact.id, channel: 'email', step: 0, status: 'sent', sentAt: monday })
    }
    await db.insert(events).values([
      { contactId: first.id, type: 'view', createdAt: tuesday },
      { contactId: first.id, type: 'view', createdAt: tuesday },
      { contactId: second.id, type: 'view', createdAt: tuesday },
    ])
    await db.insert(responses).values([
      { contactId: first.id, channel: 'landing', kind: 'intent', intent: 'info', createdAt: tuesday },
      { contactId: first.id, channel: 'email', kind: 'reply', intent: 'meeting', createdAt: new Date(tuesday.getTime() + 3_600_000) },
      { contactId: second.id, channel: 'email', kind: 'auto_reply', intent: 'other', createdAt: tuesday },
    ])
    const days = await responsePulse(db, { days: 7, timezone: tz, now })
    expect(days).toHaveLength(7)
    expect(days.at(-1)?.day).toBe(localDay(now, tz))
    const byDay = new Map(days.map((day) => [day.day, day]))
    expect(byDay.get('2026-09-21')).toMatchObject({ sent: 3, reached: 3, views: 0, responses: 0 })
    expect(byDay.get('2026-09-23')).toMatchObject({ views: 2, responses: 1, meetings: 1 })
    expect(byDay.get('2026-09-22')).toMatchObject({ views: 0, responses: 0 })

    const mix = await responseMix(db)
    expect(mix.responders).toBe(1)
    expect(mix.intents).toEqual({ meeting: 1 })
    expect(mix.medianHours).toBeCloseTo(38, 1)

    const sectors = await sectorPerformance(db)
    expect(sectors.anySent).toBe(true)
    expect(sectors.rows[0]).toMatchObject({ sector: 'Lojistik', people: 2, contacted: 2, responded: 1 })
    expect(sectors.rows[1]).toMatchObject({ sector: 'Fintek', people: 1, contacted: 1, responded: 0 })
  })

  it('shows the sector spread before anything is sent', async () => {
    await seed()
    const sectors = await sectorPerformance(db)
    expect(sectors.anySent).toBe(false)
    expect(sectors.rows.map((row) => [row.sector, row.people])).toEqual([
      ['Lojistik', 2],
      ['Fintek', 1],
    ])
    const days = await responsePulse(db, { days: 30, timezone: tz, now })
    expect(days.every((day) => day.sent === 0 && day.responses === 0)).toBe(true)
  })
})
