import { after } from 'next/server'
import { getDb } from '@/lib/db'
import { baseUrl } from '@/lib/env'
import { getSettings } from '@/lib/settings'
import { notifyTeam } from '@/lib/notify'
import { recordEvent } from '@/lib/campaign/state'
import { parseTelegramUpdate, sendTelegramText, verifyTelegramSecret } from '@/lib/channels/telegram'
import { resolveTelegram } from '@/lib/telegram/config'
import { handleTelegramEvent, markChatBlocked } from '@/lib/telegram/inbound'

export async function POST(request: Request) {
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token || !verifyTelegramSecret(request.headers.get('x-telegram-bot-api-secret-token'), config.webhookSecret)) return new Response('forbidden', { status: 401 })
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }
  const event = parseTelegramUpdate(body)
  if (!event) return Response.json({ ok: true })
  const settings = await getSettings(db)
  const outcome = await handleTelegramEvent(db, event, { team: settings.sender.company, teamChatId: config.team?.chatId })
  for (const reply of outcome.replies) {
    const sent = await sendTelegramText(config.token, reply.chatId, reply.text)
    if (sent.blocked) await markChatBlocked(db, reply.chatId)
    else if (sent.providerId && reply.greeting && reply.contactId) {
      await recordEvent(db, { contactId: reply.contactId, type: 'tg_greeting', data: { text: reply.text.slice(0, 1000), id: sent.providerId, chatId: reply.chatId } })
    }
  }
  if (outcome.notices.length) {
    const base = baseUrl()
    after(async () => {
      for (const notice of outcome.notices) {
        const subject = notice.started ? `${notice.name} Telegram sohbetini başlattı` : `${notice.name} Telegram'dan yazdı`
        const moved = notice.previous ? [`Bu Telegram hesabı daha önce ${notice.previous} ile eşleşmişti; sohbet artık bu kişide.`] : []
        await notifyTeam(db, settings, subject, [`${notice.company} · ${notice.handle}`, ...moved, '', notice.text.slice(0, 800), '', `${base}/telegram?kisi=${notice.contactId}`])
      }
    })
  }
  return Response.json({ ok: true })
}
