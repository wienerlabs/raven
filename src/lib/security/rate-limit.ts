import { sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { loginAttempts } from '@/lib/db/schema'

export async function consumeRate(db: Database, key: string, windowMs: number, now = new Date()): Promise<number> {
  const nowIso = now.toISOString()
  const resetIso = new Date(now.getTime() + windowMs).toISOString()
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
  return row?.count ?? 0
}
