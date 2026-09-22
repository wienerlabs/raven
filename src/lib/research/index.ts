import { eq } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { domains } from '@/lib/db/schema'
import { fetchWebsite, freeMailDomains, lookupMx } from './website'

export async function researchDomain(db: Database, domain: string, options: { refresh?: boolean } = {}) {
  const key = domain.toLowerCase()
  const existing = await db.select().from(domains).where(eq(domains.domain, key)).limit(1)
  if (existing[0]?.fetchedAt && !options.refresh) return existing[0]
  const [site, mx] = await Promise.all([
    freeMailDomains.has(key) ? Promise.resolve({ url: null, title: null, description: null, excerpt: null, error: 'free mail provider' }) : fetchWebsite(key),
    lookupMx(key),
  ])
  const row = {
    domain: key,
    url: site.url,
    title: site.title,
    description: site.description,
    excerpt: site.excerpt,
    error: site.error,
    mxHosts: mx.hosts,
    mxOk: mx.ok,
    fetchedAt: new Date(),
  }
  await db.insert(domains).values(row).onConflictDoUpdate({ target: domains.domain, set: row })
  return row
}

export async function getResearch(db: Database, domain: string | null) {
  if (!domain) return null
  const rows = await db.select().from(domains).where(eq(domains.domain, domain.toLowerCase())).limit(1)
  return rows[0] ?? null
}
