import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, pitches, type ReviewStatus, type Stage } from '@/lib/db/schema'

export interface ContactHit {
  id: string
  name: string
  company: string
  email: string | null
  stage: Stage
  reviewStatus: ReviewStatus
  solution: string | null
}

export async function searchContacts(db: Database, query: string, limit = 8): Promise<ContactHit[]> {
  const q = query.replace(/[%_\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return []
  const pattern = `%${q}%`
  const rows = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      company: contacts.company,
      email: contacts.email,
      stage: contacts.stage,
      reviewStatus: contacts.reviewStatus,
      solution: sql<string | null>`${pitches.content}->'solution'->>'name'`,
    })
    .from(contacts)
    .leftJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(
      or(
        ilike(contacts.firstName, pattern),
        ilike(contacts.lastName, pattern),
        ilike(sql`${contacts.firstName} || ' ' || ${contacts.lastName}`, pattern),
        ilike(contacts.company, pattern),
        ilike(contacts.email, pattern),
        ilike(contacts.phone, pattern),
        ilike(sql`coalesce(${pitches.content}->'solution'->>'name', '')`, pattern),
      ),
    )
    .orderBy(desc(contacts.lastActivityAt), contacts.firstName)
    .limit(Math.max(1, Math.min(limit, 20)))
  return rows.map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim(), company: row.company, email: row.email, stage: row.stage, reviewStatus: row.reviewStatus, solution: row.solution }))
}
