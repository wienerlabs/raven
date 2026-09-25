'use server'

import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { contacts, pitches, responses } from '@/lib/db/schema'
import { hasAi } from '@/lib/env'
import { requireAdmin } from '@/lib/security/session'
import { AI_BUSY, draftReply } from '@/lib/ai/reply'
import { takeAiBudget } from '@/lib/security/ai-budget'
import { aiFailure } from '@/lib/ai/client'
import { replyContextFor } from '@/lib/ai/reply-context'

export async function draftEmailReplyAction(responseId: string): Promise<{ ok: true; text: string; subject: string; to: string | null } | { ok: false; message: string }> {
  const session = await requireAdmin()
  if (!/^[0-9a-f-]{36}$/i.test(responseId)) return { ok: false, message: 'Yanıt bulunamadı.' }
  if (!hasAi()) return { ok: false, message: 'AI taslak için ANTHROPIC_API_KEY tanımlı olmalı.' }
  const db = await getDb()
  if (!(await takeAiBudget(db, session.sub))) return { ok: false, message: AI_BUSY }
  const [row] = await db
    .select({ contactId: responses.contactId, email: contacts.email, subject: pitches.content })
    .from(responses)
    .innerJoin(contacts, eq(contacts.id, responses.contactId))
    .leftJoin(pitches, eq(pitches.contactId, responses.contactId))
    .where(eq(responses.id, responseId))
    .limit(1)
  if (!row) return { ok: false, message: 'Yanıt bulunamadı.' }
  const context = await replyContextFor(db, row.contactId, 'email')
  if (!context) return { ok: false, message: 'Kişi bulunamadı.' }
  try {
    const draft = await draftReply(context)
    const subject = row.subject?.email.subject ? `Re: ${row.subject.email.subject}` : 'Wiener Labs'
    return { ok: true, text: draft.text, subject, to: row.email }
  } catch (error) {
    console.error('reply draft failed', error)
    return { ok: false, message: aiFailure(error) }
  }
}
