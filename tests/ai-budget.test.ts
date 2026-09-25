import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { AI_LIMITS, AI_WINDOW_MS, takeAiBudget } from '@/lib/security/ai-budget'
import { loginBlocked } from '@/lib/security/login-limit'
import { openTestDb, type TestDatabase } from './db'

describe('ai draft budget', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  it('caps drafts per person, resets after the window and never touches sign in limits', async () => {
    const now = new Date('2026-09-25T10:00:00Z')
    for (let index = 0; index < AI_LIMITS.person; index += 1) expect(await takeAiBudget(db, 'member-a', now)).toBe(true)
    expect(await takeAiBudget(db, 'member-a', now)).toBe(false)
    expect(await takeAiBudget(db, 'member-b', now)).toBe(true)
    expect(await takeAiBudget(db, 'member-a', new Date(now.getTime() + AI_WINDOW_MS + 1000))).toBe(true)
    expect(await loginBlocked(db, '127.0.0.1', now)).toBe(false)
  })

  it('stops everyone once the shared hourly budget is spent', async () => {
    const now = new Date('2026-09-25T10:00:00Z')
    for (let index = 0; index < AI_LIMITS.global; index += 1) await takeAiBudget(db, `member-${index % 5}-${Math.floor(index / 50)}`, now)
    expect(await takeAiBudget(db, 'fresh-member', now)).toBe(false)
  })
})
