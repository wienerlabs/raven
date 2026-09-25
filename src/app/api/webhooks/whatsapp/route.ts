import { getDb } from '@/lib/db'
import { parseWhatsappWebhook, verifyMetaSignature } from '@/lib/channels/whatsapp'
import { markWebhookVerified, resolveWhatsapp } from '@/lib/whatsapp/config'
import { handleWhatsappEvents } from '@/lib/whatsapp/inbound'
import { getSettings } from '@/lib/settings'
import { notifyTeam } from '@/lib/notify'
import { safeEqual } from '@/lib/security/tokens'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const db = await getDb()
  const config = await resolveWhatsapp(db)
  const token = url.searchParams.get('hub.verify_token') ?? ''
  if (url.searchParams.get('hub.mode') === 'subscribe' && config.verifyToken && safeEqual(token, config.verifyToken)) {
    await markWebhookVerified(db)
    return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
  }
  return new Response('forbidden', { status: 403 })
}

export async function POST(request: Request) {
  const raw = await request.text()
  const db = await getDb()
  const config = await resolveWhatsapp(db)
  if (!verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), config.appSecret)) return new Response('invalid signature', { status: 401 })
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const summary = await handleWhatsappEvents(db, parseWhatsappWebhook(body))
  if (summary.notices.length) {
    const settings = await getSettings(db)
    for (const notice of summary.notices) {
      const subject = notice.verified ? `${notice.name} WhatsApp'tan yazdı` : `${notice.name} için WhatsApp mesajı (doğrulanmamış numara)`
      const origin = notice.verified ? notice.company : `${notice.company} · ${notice.from} numarası kişinin kaydında yok, panelden kontrol edin`
      await notifyTeam(db, settings, subject, [origin, '', notice.text.slice(0, 800)])
    }
  }
  return Response.json({ ok: true })
}
