'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/security/session'
import { cancelCampaignQueue, ensureCampaign, launchCampaign, setCampaignStatus, updateCampaignConfig } from '@/lib/campaign/launch'
import { dispatchDue, type DispatchReport } from '@/lib/campaign/dispatch'
import { activeSenders } from '@/lib/channels/email'
import { syncSenderInbox, type InboxSyncResult } from '@/lib/inbox/sync'
import { formatDateTime } from '@/lib/labels'
import type { ActionResult } from './contacts'

function refresh() {
  revalidatePath('/kampanya')
  revalidatePath('/')
  revalidatePath('/kisiler')
}

export async function launch(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  const summary = await launchCampaign(db, campaign.id)
  refresh()
  if (summary.queuedEmail + summary.queuedWhatsapp + summary.manualWhatsapp === 0) {
    return { ok: false, message: 'Sıraya alınacak onaylı ve henüz iletişime geçilmemiş kişi yok.' }
  }
  const window = summary.firstAt && summary.lastAt ? ` İlk gönderim ${formatDateTime(summary.firstAt)}, son gönderim ${formatDateTime(summary.lastAt)}.` : ''
  const whatsapp = summary.manualWhatsapp ? ` ${summary.manualWhatsapp} WhatsApp mesajı elle gönderim kuyruğunda.` : ''
  return { ok: true, message: `${summary.queuedEmail} e-posta sıraya alındı.${window}${whatsapp}` }
}

export async function pause(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  await setCampaignStatus(db, campaign.id, 'paused', 'Elle durduruldu')
  refresh()
  return { ok: true, message: 'Kampanya durduruldu. Sıradaki mesajlar bekliyor.' }
}

export async function resume(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  await setCampaignStatus(db, campaign.id, 'running')
  refresh()
  return { ok: true, message: 'Kampanya devam ediyor.' }
}

export async function clearQueue(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  const cancelled = await cancelCampaignQueue(db, campaign.id)
  await setCampaignStatus(db, campaign.id, 'paused', 'Kuyruk temizlendi')
  refresh()
  return { ok: true, message: `${cancelled} planlı mesaj iptal edildi.` }
}

const configForm = z.object({
  windowStartHour: z.coerce.number().int().min(0).max(23),
  windowEndHour: z.coerce.number().int().min(1).max(24),
  minGapSeconds: z.coerce.number().int().min(20).max(3600),
  maxGapSeconds: z.coerce.number().int().min(20).max(7200),
  dailyLimitPerSender: z.coerce.number().int().min(1).max(2000),
  followUpDay1: z.coerce.number().int().min(1).max(30),
  followUpDay2: z.coerce.number().int().min(1).max(30),
  followUpsEnabled: z.boolean(),
  subjectTest: z.boolean(),
  weekend: z.boolean(),
})

export async function saveConfig(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const parsed = configForm.safeParse({
    windowStartHour: formData.get('windowStartHour'),
    windowEndHour: formData.get('windowEndHour'),
    minGapSeconds: formData.get('minGapSeconds'),
    maxGapSeconds: formData.get('maxGapSeconds'),
    dailyLimitPerSender: formData.get('dailyLimitPerSender'),
    followUpDay1: formData.get('followUpDay1'),
    followUpDay2: formData.get('followUpDay2'),
    followUpsEnabled: formData.get('followUpsEnabled') === 'on',
    subjectTest: formData.get('subjectTest') === 'on',
    weekend: formData.get('weekend') === 'on',
  })
  if (!parsed.success) return { ok: false, message: 'Ayarlar geçersiz.', errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  const value = parsed.data
  if (value.windowEndHour <= value.windowStartHour) return { ok: false, message: 'Bitiş saati başlangıçtan sonra olmalı.' }
  if (value.maxGapSeconds < value.minGapSeconds) return { ok: false, message: 'En uzun aralık en kısa aralıktan küçük olamaz.' }
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  await updateCampaignConfig(db, campaign.id, {
    ...campaign.config,
    windowStartHour: value.windowStartHour,
    windowEndHour: value.windowEndHour,
    minGapSeconds: value.minGapSeconds,
    maxGapSeconds: value.maxGapSeconds,
    dailyLimitPerSender: value.dailyLimitPerSender,
    followUpDays: [value.followUpDay1, value.followUpDay2],
    followUpsEnabled: value.followUpsEnabled,
    subjectTest: value.subjectTest,
    weekdays: value.weekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5],
  })
  refresh()
  return { ok: true, message: 'Kampanya ayarları kaydedildi. Yeni ayarlar bundan sonraki planlamalarda geçerli.' }
}

export async function dispatchNow(): Promise<DispatchReport> {
  await requireAdmin()
  const db = await getDb()
  const report = await dispatchDue(db, { limit: 5 })
  if (report.claimed) refresh()
  return report
}

export async function syncInboxNow(): Promise<{ ok: boolean; results: InboxSyncResult[] }> {
  await requireAdmin()
  const db = await getDb()
  const senders = activeSenders().filter((sender) => sender.imap)
  const results: InboxSyncResult[] = []
  for (const sender of senders) results.push(await syncSenderInbox(db, sender))
  revalidatePath('/yanitlar')
  refresh()
  return { ok: results.every((result) => !result.error), results }
}
