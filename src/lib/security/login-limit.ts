import { eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { loginAttempts } from '@/lib/db/schema'

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const LOGIN_LIMITS = { ip: 10, global: 40 }

function keysFor(ip: string): string[] {
  return [`ip:${ip}`, 'global']
}

export async function loginBlocked(db: Database, ip: string, now = new Date()): Promise<boolean> {
  const rows = await db.select().from(loginAttempts).where(inArray(loginAttempts.key, keysFor(ip)))
  return rows.some((row) => row.resetAt.getTime() > now.getTime() && row.count >= (row.key === 'global' ? LOGIN_LIMITS.global : LOGIN_LIMITS.ip))
}

export async function registerLoginFailure(db: Database, ip: string, now = new Date()): Promise<void> {
  const nowIso = now.toISOString()
  const resetIso = new Date(now.getTime() + LOGIN_WINDOW_MS).toISOString()
  for (const key of keysFor(ip)) {
    await db
      .insert(loginAttempts)
      .values({ key, count: 1, resetAt: new Date(resetIso) })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`case when ${loginAttempts.resetAt} < ${nowIso}::timestamptz then 1 else ${loginAttempts.count} + 1 end`,
          resetAt: sql`case when ${loginAttempts.resetAt} < ${nowIso}::timestamptz then ${resetIso}::timestamptz else ${loginAttempts.resetAt} end`,
        },
      })
  }
}

export async function clearLoginFailures(db: Database, ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, `ip:${ip}`))
}
