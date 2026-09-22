import { eq, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, pitches, type ReviewStatus } from '@/lib/db/schema'
import { holdReasonFor, needsHold } from '@/lib/contacts/compliance'
import type { Pitch } from './schema'

export async function savePitch(
  db: Database,
  contactId: string,
  pitch: Pitch,
  options: { source: 'ai' | 'import' | 'manual'; model?: string | null; warnings: string[]; approve?: boolean },
): Promise<{ reviewStatus: ReviewStatus }> {
  const now = new Date()
  await db
    .insert(pitches)
    .values({ contactId, content: pitch, source: options.source, model: options.model ?? null, warnings: options.warnings })
    .onConflictDoUpdate({
      target: pitches.contactId,
      set: { content: pitch, source: options.source, model: options.model ?? null, warnings: options.warnings, version: sql`${pitches.version} + 1`, updatedAt: now },
    })
  const rows = await db.select({ flags: contacts.flags, reviewStatus: contacts.reviewStatus }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
  const current = rows[0]
  const flags = [...new Set([...(current?.flags ?? []), ...pitch.flags])]
  let reviewStatus: ReviewStatus = current?.reviewStatus ?? 'pending'
  let holdReason: string | null = null
  if (needsHold(flags)) {
    reviewStatus = 'hold'
    holdReason = holdReasonFor(flags)
  } else if (reviewStatus !== 'excluded') {
    reviewStatus = options.approve ? 'approved' : reviewStatus === 'approved' && options.source === 'manual' ? 'approved' : 'pending'
  }
  await db
    .update(contacts)
    .set({ flags, language: pitch.language, reviewStatus, holdReason, updatedAt: now })
    .where(eq(contacts.id, contactId))
  return { reviewStatus }
}

export async function getPitch(db: Database, contactId: string) {
  const rows = await db.select().from(pitches).where(eq(pitches.contactId, contactId)).limit(1)
  return rows[0] ?? null
}
