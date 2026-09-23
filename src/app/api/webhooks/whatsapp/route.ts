import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { messages } from '@/lib/db/schema'
import { whatsappCloud } from '@/lib/env'
import { isStopWord, parseWhatsappWebhook, verifyMetaSignature } from '@/lib/channels/whatsapp'
import { findContactByAddress, recordEvent, recordResponse, suppress } from '@/lib/campaign/state'
import { classifyReplyIntent } from '@/lib/inbox/classify'
import { getSettings } from '@/lib/settings'
import { notifyTeam } from '@/lib/notify'
import { safeEqual } from '@/lib/security/tokens'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const config = whatsappCloud()
  const token = url.searchParams.get('hub.verify_token') ?? ''
  if (url.searchParams.get('hub.mode') === 'subscribe' && config.verifyToken && safeEqual(token, config.verifyToken)) {
    return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const raw = await request.text()
  const config = whatsappCloud()
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) return new Response('invalid signature', { status: 401 })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const db = await getDb()
  for (const event of parseWhatsappWebhook(body)) {
    if (event.kind === 'status' && event.providerId) {
      const [message] = await db.select().from(messages).where(eq(messages.providerId, event.providerId)).limit(1)
      if (!message) continue
      const type = event.status === 'read' ? 'wa_read' : event.status === 'delivered' ? 'wa_delivered' : event.status === 'failed' ? 'wa_failed' : null
      if (type) await recordEvent(db, { contactId: message.contactId, messageId: message.id, type, data: { status: event.status } })
      continue
    }
    if (event.kind === 'message' && event.from) {
      const contact = await findContactByAddress(db, `+${event.from.replace(/\D/g, '')}`)
      if (!contact) continue
      if (isStopWord(event.text)) {
        await suppress(db, { contactId: contact.id, value: contact.phone ?? `+${event.from}`, kind: 'phone', reason: 'stop' })
        await recordEvent(db, { contactId: contact.id, type: 'unsubscribe', data: { via: 'whatsapp' } })
        continue
      }
      const text = event.text ?? ''
      await recordResponse(db, { contactId: contact.id, channel: 'whatsapp', kind: 'reply', intent: classifyReplyIntent(text), body: text, fromAddress: contact.phone })
      const settings = await getSettings(db)
      await notifyTeam(settings, `${contact.firstName} ${contact.lastName} WhatsApp'tan yanıt verdi`, [contact.company, '', text.slice(0, 800)])
    }
  }
  return Response.json({ ok: true })
}
