import type { Database } from '@/lib/db'
import { consumeRate } from './rate-limit'

export const AI_WINDOW_MS = 60 * 60 * 1000
export const AI_LIMITS = { person: 60, global: 240 }

export async function takeAiBudget(db: Database, subject: string, now = new Date()): Promise<boolean> {
  const limits: Array<[string, number]> = [
    [`ai:${subject}`, AI_LIMITS.person],
    ['ai:global', AI_LIMITS.global],
  ]
  let allowed = true
  for (const [key, limit] of limits) {
    if ((await consumeRate(db, key, AI_WINDOW_MS, now)) > limit) allowed = false
  }
  return allowed
}
