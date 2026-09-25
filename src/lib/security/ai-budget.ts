import { sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { loginAttempts } from '@/lib/db/schema'

export const AI_WINDOW_MS = 60 * 60 * 1000
export const AI_LIMITS = { person: 60, global: 240 }

export async function takeAiBudget(db: Database, subject: string, now = new Date()): Promise<boolean> {
  const nowIso = now.toISOString()
  const resetIso = new Date(now.getTime() + AI_WINDOW_MS).toISOString()
  const limits: Array<[string, number]> = [
    [`ai:${subject}`, AI_LIMITS.person],
    ['ai:global', AI_LIMITS.global],
  ]
  let allowed = true
  for (const [key, limit] of limits) {
    const [row] = await db
      .insert(loginAttempts)
      .values({ key, count: 1, resetAt: new Date(resetIso) })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`case when ${loginAttempts.resetAt} < ${nowIso}::timestamptz then 1 else ${loginAttempts.count} + 1 end`,
          resetAt: sql`case when ${loginAttempts.resetAt} < ${nowIso}::timestamptz then ${resetIso}::timestamptz else ${loginAttempts.resetAt} end`,
        },
      })
      .returning({ count: loginAttempts.count })
    if ((row?.count ?? 0) > limit) allowed = false
  }
  return allowed
}
