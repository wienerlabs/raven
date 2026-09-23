import { and, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { contactBySlug } from '@/lib/public'
import { findMessageByToken, moveStage, recordEvent } from '@/lib/campaign/state'

const bodySchema = z.object({
  slug: z.string().regex(/^[A-Za-z0-9]{6,32}$/),
  token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).nullable().optional(),
  source: z.enum(['email', 'whatsapp']).optional(),
  kind: z.enum(['view', 'dwell']),
  seconds: z.number().int().min(0).max(24 * 3600).optional(),
})

const botPattern = /(bot|crawler|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda|headless|python-requests|curl|wget|facebookexternalhit|slackbot|whatsapp)/i

export async function POST(request: Request) {
  const agent = request.headers.get('user-agent') ?? ''
  if (botPattern.test(agent)) return new Response(null, { status: 204 })
  let payload: unknown
  try {
    payload = JSON.parse(await request.text())
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) return new Response(null, { status: 400 })
  const db = await getDb()
  const found = await contactBySlug(db, parsed.data.slug)
  if (!found) return new Response(null, { status: 404 })
  const { contact } = found
  const message = parsed.data.token ? await findMessageByToken(db, parsed.data.token) : null
  if (message?.isTest) return new Response(null, { status: 204 })
  const messageId = message && message.contactId === contact.id && !message.isTest ? message.id : null
  if (parsed.data.kind === 'dwell') {
    await recordEvent(db, { contactId: contact.id, messageId, type: 'dwell', data: { seconds: parsed.data.seconds ?? 0, source: parsed.data.source ?? 'email' } })
    return new Response(null, { status: 204 })
  }
  const recent = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.contactId, contact.id), eq(events.type, 'view'), gte(events.createdAt, new Date(Date.now() - 10 * 60 * 1000))))
    .limit(1)
  if (recent.length === 0) {
    await recordEvent(db, { contactId: contact.id, messageId, type: 'view', data: { source: parsed.data.source ?? 'email' } })
    if (contact.stage === 'contacted' || contact.stage === 'queued') await moveStage(db, contact.id, 'engaged')
  }
  return new Response(null, { status: 204 })
}
