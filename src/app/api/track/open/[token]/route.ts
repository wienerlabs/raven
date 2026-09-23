import { and, eq, gte } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { findMessageByToken, recordEvent } from '@/lib/campaign/state'

const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function gif() {
  return new Response(new Uint8Array(pixel), { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, max-age=0' } })
}

export async function GET(_: Request, context: RouteContext<'/api/track/open/[token]'>) {
  const { token } = await context.params
  try {
    const db = await getDb()
    const message = await findMessageByToken(db, token)
    if (message && !message.isTest) {
      const recent = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.messageId, message.id), eq(events.type, 'open'), gte(events.createdAt, new Date(Date.now() - 60 * 60 * 1000))))
        .limit(1)
      if (recent.length === 0) await recordEvent(db, { contactId: message.contactId, messageId: message.id, type: 'open', data: {} })
    }
  } catch {
    return gif()
  }
  return gif()
}
