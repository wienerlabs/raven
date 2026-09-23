import { and, count, eq, gte } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { events } from '@/lib/db/schema'
import { baseUrl, emailProvider, hasAi, readSenders, whatsappMode, type SenderConfig } from '@/lib/env'
import type { AppSettings } from '@/lib/settings'

export interface ReadinessItem {
  key: string
  label: string
  detail: string
  done: boolean
  href: string
}

export function safeSenders(): { senders: SenderConfig[]; error: string | null } {
  try {
    return { senders: readSenders(), error: null }
  } catch (error) {
    return { senders: [], error: error instanceof Error ? error.message : String(error) }
  }
}

export async function readiness(db: Database, settings: AppSettings, stats: { total: number; withPitch: number; approved: number }): Promise<ReadinessItem[]> {
  const provider = emailProvider()
  const { senders, error } = safeSenders()
  const url = baseUrl()
  const [tests] = await db.select({ value: count() }).from(events).where(and(eq(events.type, 'test_sent'), gte(events.createdAt, new Date(Date.now() - 14 * 24 * 3600 * 1000))))
  return [
    {
      key: 'pitches',
      label: 'Kişiye özel içerikler',
      detail: `${stats.withPitch} / ${stats.total} kişi için çözüm ve metin hazır`,
      done: stats.total > 0 && stats.withPitch >= stats.total,
      href: '/kisiler?pitch=missing',
    },
    {
      key: 'review',
      label: 'İnceleme ve onay',
      detail: `${stats.approved} kişi onaylı`,
      done: stats.approved > 0,
      href: '/kisiler?review=pending',
    },
    {
      key: 'provider',
      label: 'Gönderim altyapısı',
      detail: error ? `RAVEN_SENDERS okunamadı: ${error}` : provider === 'console' ? 'Konsol modunda: e-postalar gerçekten gönderilmez' : `${provider === 'smtp' ? 'SMTP' : 'Resend'} ile ${senders.length} gönderen tanımlı`,
      done: !error && provider !== 'console' && senders.length > 0,
      href: '/ayarlar#altyapi',
    },
    {
      key: 'inbox',
      label: 'Yanıt ve geri dönme takibi',
      detail: senders.some((sender) => sender.imap) ? 'IMAP ile gelen kutusu taranıyor' : 'IMAP tanımlı değil: yanıtlar panele otomatik düşmez',
      done: senders.some((sender) => sender.imap),
      href: '/ayarlar#altyapi',
    },
    {
      key: 'url',
      label: 'Genel adres',
      detail: url.startsWith('https://') ? url : `${url} (yerel adres, alıcılar açamaz)`,
      done: url.startsWith('https://'),
      href: '/ayarlar#altyapi',
    },
    {
      key: 'legal',
      label: 'Gönderen kimliği ve aydınlatma',
      detail: settings.legal.address && settings.legal.contactEmail ? 'Adres ve KVKK başvuru e-postası tanımlı' : 'Şirket adresi ve KVKK başvuru e-postası eksik',
      done: Boolean(settings.legal.address && settings.legal.contactEmail),
      href: '/ayarlar#hukuki',
    },
    {
      key: 'test',
      label: 'Kendinize test gönderimi',
      detail: (tests?.value ?? 0) > 0 ? 'Son iki haftada test gönderildi' : 'Kampanyadan önce en az bir test gönderin',
      done: (tests?.value ?? 0) > 0,
      href: '/kisiler',
    },
  ]
}

export function environmentSummary() {
  const { senders, error } = safeSenders()
  return {
    provider: emailProvider(),
    senders: senders.map((sender) => ({ id: sender.id, name: sender.name, email: sender.email, dailyLimit: sender.dailyLimit, smtp: Boolean(sender.smtp), imap: Boolean(sender.imap), replyTo: sender.replyTo ?? sender.email })),
    sendersError: error,
    baseUrl: baseUrl(),
    ai: hasAi(),
    aiModel: process.env.RAVEN_AI_MODEL?.trim() || 'claude-opus-5-5',
    whatsapp: whatsappMode(),
    whatsappConfigured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    cronSecret: Boolean(process.env.CRON_SECRET),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
  }
}
