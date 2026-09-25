'use server'

import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/security/session'
import { searchContacts, type ContactHit } from '@/lib/search'

export async function searchContactsAction(query: string): Promise<ContactHit[]> {
  await requireAdmin()
  if (typeof query !== 'string') return []
  const db = await getDb()
  return searchContacts(db, query, 8)
}
