import { and, eq, lt } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { locks } from '@/lib/db/schema'
import { randomToken } from '@/lib/security/tokens'

export async function acquireLease(db: Database, name: string, ttlMs: number, now = new Date()): Promise<string | null> {
  const holder = randomToken(12)
  const expiresAt = new Date(now.getTime() + ttlMs)
  const rows = await db
    .insert(locks)
    .values({ name, holder, expiresAt })
    .onConflictDoUpdate({ target: locks.name, set: { holder, expiresAt }, setWhere: lt(locks.expiresAt, now) })
    .returning({ holder: locks.holder })
  return rows[0]?.holder === holder ? holder : null
}

export async function releaseLease(db: Database, name: string, holder: string): Promise<void> {
  await db.delete(locks).where(and(eq(locks.name, name), eq(locks.holder, holder)))
}

export async function withLease<T>(db: Database, name: string, ttlMs: number, task: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const holder = await acquireLease(db, name, ttlMs)
  if (!holder) return { acquired: false }
  try {
    return { acquired: true, value: await task() }
  } finally {
    await releaseLease(db, name, holder)
  }
}
