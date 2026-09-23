import { createHmac } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { contacts, messages } from '@/lib/db/schema'
import { recordEvent, suppress } from '@/lib/campaign/state'
import { safeEqual } from '@/lib/security/tokens'

function verifySvix(raw: string, headers: Headers, secret: string): boolean {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!id || !timestamp || !signatures || !secret) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')
  return signatures.split(' ').some((entry) => {
    const [version, signature] = entry.split(',')
    return version === 'v1' && Boolean(signature) && safeEqual(signature, expected)
  })
}

interface ResendEvent {
  type?: string
  data?: { email_id?: string; bounce?: { type?: string; message?: string } }
}

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifySvix(raw, request.headers, process.env.RESEND_WEBHOOK_SECRET ?? '')) return new Response('invalid signature', { status: 401 })
  let event: ResendEvent
  try {
    event = JSON.parse(raw) as ResendEvent
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const emailId = event.data?.email_id
  if (!emailId || !event.type) return Response.json({ ok: true })
  const db = await getDb()
  const [message] = await db.select().from(messages).where(eq(messages.providerId, emailId)).limit(1)
  if (!message || message.isTest) return Response.json({ ok: true })
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, message.contactId)).limit(1)
  const map: Record<string, string> = { 'email.delivered': 'delivered', 'email.opened': 'open', 'email.clicked': 'click', 'email.bounced': 'bounce', 'email.complained': 'complaint' }
  const type = map[event.type]
  if (!type) return Response.json({ ok: true })
  await recordEvent(db, { contactId: message.contactId, messageId: message.id, type, data: { provider: 'resend', bounce: event.data?.bounce?.type ?? null } })
  if (contact?.email && type === 'bounce' && event.data?.bounce?.type !== 'Transient') await suppress(db, { contactId: contact.id, value: contact.email, kind: 'email', reason: 'bounce' })
  if (contact?.email && type === 'complaint') await suppress(db, { contactId: contact.id, value: contact.email, kind: 'email', reason: 'complaint' })
  return Response.json({ ok: true })
}
