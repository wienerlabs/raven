'use server'

import { revalidatePath } from 'next/cache'
import { getDb, type Database } from '@/lib/db'
import { baseUrl, hasAi } from '@/lib/env'
import { requireAdmin } from '@/lib/security/session'
import { getSettings } from '@/lib/settings'
import { recordEvent } from '@/lib/campaign/state'
import { botWebhookStatus, configureBotProfile, deleteBotWebhook, getBotIdentity, groupStartLink, isBotToken, sendTelegramText, setBotWebhook, startLink, teamPayload } from '@/lib/channels/telegram'
import { clearTelegramBot, issueTeamCode, recordWebhook, resolveTelegram, saveTelegramBot, unlinkTeamChat } from '@/lib/telegram/config'
import { botProfiles, teamCopy } from '@/lib/telegram/copy'
import { latestTelegramChat, markChatBlocked } from '@/lib/telegram/inbound'
import { setTelegramHandled } from '@/lib/telegram/inbox'
import { AI_BUSY, draftReply } from '@/lib/ai/reply'
import { aiFailure } from '@/lib/ai/client'
import { takeAiBudget } from '@/lib/security/ai-budget'
import { replyContextFor } from '@/lib/ai/reply-context'
import type { ActionResult } from './contacts'

const contactPattern = /^[0-9a-f-]{36}$/i
const RECENT_ERROR_MS = 24 * 60 * 60 * 1000

function refresh() {
  revalidatePath('/telegram')
  revalidatePath('/yanitlar')
  revalidatePath('/ayarlar')
}

function webhookUrl(): string {
  return `${baseUrl()}/api/webhooks/telegram`
}

async function connectWebhook(db: Database, token: string, secret: string): Promise<string | null> {
  const url = webhookUrl()
  const error = url.startsWith('https://') ? (await setBotWebhook(token, url, secret)).error : 'Genel adres https ile başlamalı (RAVEN_BASE_URL).'
  await recordWebhook(db, { error })
  return error
}

export async function saveTelegramBotAction(token: string): Promise<ActionResult> {
  await requireAdmin()
  const value = String(token ?? '').trim()
  if (!value) return { ok: false, message: 'Bot anahtarını yapıştırın.' }
  if (!isBotToken(value)) return { ok: false, message: "Anahtar biçimi tanınmadı. BotFather'ın verdiği 123456789:AA ile başlayan anahtarın tamamını yapıştırın." }
  const identity = await getBotIdentity(value)
  if (!identity.ok) return { ok: false, message: identity.unauthorized ? "Telegram bu anahtarı tanımadı. BotFather'dan anahtarı yeniden kopyalayın." : `Telegram'a ulaşılamadı: ${identity.error}` }
  const db = await getDb()
  const stored = await saveTelegramBot(db, { token: value, botId: identity.bot.id, username: identity.bot.username, botName: identity.bot.name })
  const settings = await getSettings(db)
  const webhookError = await connectWebhook(db, value, stored.webhookSecret)
  await configureBotProfile(value, botProfiles(settings.sender.company))
  refresh()
  if (webhookError) return { ok: false, message: `@${identity.bot.username} kaydedildi ama webhook kurulamadı: ${webhookError}` }
  return { ok: true, message: `@${identity.bot.username} bağlandı. Açıklama ve komutlar ayarlandı, mesajlar artık Raven'a düşüyor.` }
}

export async function reconnectTelegramAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token) return { ok: false, message: 'Önce bot anahtarını kaydedin.' }
  const error = await connectWebhook(db, config.token, config.webhookSecret)
  refresh()
  return error ? { ok: false, message: `Webhook kurulamadı: ${error}` } : { ok: true, message: 'Webhook yeniden kuruldu.' }
}

export async function checkTelegramAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token) return { ok: false, message: 'Önce bot anahtarını kaydedin.' }
  const info = await botWebhookStatus(config.token)
  if (!info.ok) return { ok: false, message: `Telegram'a ulaşılamadı: ${info.error}` }
  const expected = webhookUrl()
  if (info.status.url !== expected) {
    const error = info.status.url ? `Bot başka bir adrese bağlı: ${info.status.url}` : 'Webhook kurulu değil.'
    await recordWebhook(db, { error })
    refresh()
    return { ok: false, message: `${error} Yeniden bağlayın.` }
  }
  const recent = info.status.lastError && info.status.lastErrorAt && Date.now() - info.status.lastErrorAt.getTime() < RECENT_ERROR_MS ? info.status.lastError : null
  await recordWebhook(db, { error: recent })
  refresh()
  if (recent) return { ok: false, message: `Telegram son teslimatlarda hata aldı: ${recent}` }
  return { ok: true, message: info.status.pending ? `Bağlantı çalışıyor, ${info.status.pending} güncelleme teslim sırasında.` : 'Bağlantı çalışıyor.' }
}

export async function disconnectTelegramAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (config.token) await deleteBotWebhook(config.token)
  await clearTelegramBot(db)
  refresh()
  return { ok: true, message: 'Telegram bağlantısı kaldırıldı. Taslak sayfalarındaki ve e-postalardaki Telegram bağlantısı gizlendi.' }
}

export async function createTeamLinkAction(): Promise<{ ok: true; direct: string; group: string; expiresAt: string } | { ok: false; message: string }> {
  await requireAdmin()
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token || !config.username) return { ok: false, message: 'Önce botu bağlayın.' }
  if (!config.ready) return { ok: false, message: 'Webhook kurulmadan bağlantı çalışmaz. Önce webhooku kurun.' }
  const { code, expiresAt } = await issueTeamCode(db)
  return { ok: true, direct: startLink(config.username, teamPayload(code)), group: groupStartLink(config.username, teamPayload(code)), expiresAt: expiresAt.toISOString() }
}

export async function unlinkTeamChatAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  await unlinkTeamChat(db)
  refresh()
  return { ok: true, message: 'Bildirim sohbeti ayrıldı.' }
}

export async function sendTeamTestAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token || !config.team) return { ok: false, message: 'Bildirim sohbeti bağlı değil.' }
  const result = await sendTelegramText(config.token, config.team.chatId, teamCopy.test, { preview: false })
  if (result.error) return { ok: false, message: `Gönderilemedi: ${result.error}` }
  return { ok: true, message: `Test bildirimi ${config.team.title || 'sohbete'} gönderildi.` }
}

export async function replyTelegramAction(contactId: string, body: string): Promise<ActionResult> {
  await requireAdmin()
  const text = String(body ?? '').trim()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (text.length < 2 || text.length > 4000) return { ok: false, message: 'Mesaj 2 ile 4000 karakter arasında olmalı.' }
  const db = await getDb()
  const config = await resolveTelegram(db)
  if (!config.token) return { ok: false, message: 'Telegram botu bağlı değil.' }
  const latest = await latestTelegramChat(db, contactId)
  if (!latest) return { ok: false, message: 'Bu kişiyle açık bir Telegram sohbeti yok.' }
  if (latest.chat.contactId !== contactId) return { ok: false, message: 'Bu Telegram hesabı artık başka bir kişinin taslağıyla eşleşti. Yanıtı o kişinin sohbetinden yazın.' }
  if (latest.chat.blockedAt) return { ok: false, message: 'Kişi botu engellemiş; Telegram üzerinden yazılamıyor.' }
  if (latest.chat.stoppedAt) return { ok: false, message: 'Kişi DUR yazdı. Kendisi yeniden yazana kadar mesaj gönderilmez.' }
  const result = await sendTelegramText(config.token, latest.chat.chatId, text)
  if (result.blocked) {
    await markChatBlocked(db, latest.chat.chatId)
    refresh()
    return { ok: false, message: 'Kişi botu engellemiş; mesaj iletilemedi.' }
  }
  if (result.error) return { ok: false, message: `Gönderilemedi: ${result.error}` }
  await recordEvent(db, { contactId, type: 'tg_reply', data: { text: text.slice(0, 1000), id: result.providerId, chatId: latest.chat.chatId } })
  await setTelegramHandled(db, contactId, true)
  refresh()
  return { ok: true, message: 'Yanıt Telegram üzerinden gönderildi.' }
}

export async function setTelegramHandledAction(contactId: string, handled: boolean): Promise<ActionResult> {
  await requireAdmin()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  const db = await getDb()
  await setTelegramHandled(db, contactId, handled === true)
  refresh()
  return { ok: true, message: handled ? 'Sohbet yanıtlandı olarak işaretlendi.' : 'Sohbet yeniden bekleyenlere alındı.' }
}

export async function draftTelegramReplyAction(contactId: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const session = await requireAdmin()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (!hasAi()) return { ok: false, message: 'AI taslak için ANTHROPIC_API_KEY tanımlı olmalı.' }
  const db = await getDb()
  if (!(await takeAiBudget(db, session.sub))) return { ok: false, message: AI_BUSY }
  const context = await replyContextFor(db, contactId, 'telegram')
  if (!context) return { ok: false, message: 'Kişi bulunamadı.' }
  try {
    const draft = await draftReply(context)
    return { ok: true, text: draft.text }
  } catch (error) {
    console.error('reply draft failed', error)
    return { ok: false, message: aiFailure(error) }
  }
}
