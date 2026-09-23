'use server'

import { resolveTxt } from 'node:dns/promises'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/security/session'
import { appSettingsSchema, saveSettings } from '@/lib/settings'
import { activeSenders, emailProviderLabel, verifySmtp } from '@/lib/channels/email'
import { emailProvider } from '@/lib/env'
import type { ActionResult } from './contacts'

export async function saveSettingsAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const text = (key: string) => String(formData.get(key) ?? '').trim()
  const parsed = appSettingsSchema.safeParse({
    sender: {
      fullName: text('sender.fullName'),
      firstName: text('sender.firstName'),
      title: text('sender.title'),
      company: text('sender.company'),
      phone: text('sender.phone'),
      website: text('sender.website'),
    },
    offer: text('offer'),
    calendarUrl: text('calendarUrl'),
    notifyEmail: text('notifyEmail'),
    partnerName: text('partnerName'),
    legal: {
      companyName: text('legal.companyName'),
      address: text('legal.address'),
      contactEmail: text('legal.contactEmail'),
      mersis: text('legal.mersis'),
    },
    tracking: { opens: formData.get('tracking.opens') === 'on' },
  })
  if (!parsed.success) return { ok: false, message: 'Ayarlar kaydedilemedi.', errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  if (parsed.data.calendarUrl && !parsed.data.calendarUrl.startsWith('https://')) return { ok: false, message: 'Takvim bağlantısı https ile başlamalı.' }
  const db = await getDb()
  await saveSettings(db, parsed.data)
  revalidatePath('/ayarlar')
  revalidatePath('/')
  return { ok: true, message: 'Ayarlar kaydedildi.' }
}

export interface SenderCheck {
  id: string
  email: string
  provider: string
  smtp: string
  spf: string
  dmarc: string
  dkim: string
}

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((parts) => parts.join(''))
  } catch {
    return []
  }
}

export async function checkSenders(): Promise<SenderCheck[]> {
  await requireAdmin()
  if (emailProvider() === 'console') return []
  const selector = process.env.DKIM_SELECTOR || 'google'
  const results: SenderCheck[] = []
  for (const sender of activeSenders()) {
    const domain = sender.email.split('@')[1] ?? ''
    const [root, dmarc, dkim] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`), txt(`${selector}._domainkey.${domain}`)])
    const spfRecord = root.find((record) => record.toLowerCase().startsWith('v=spf1'))
    const dmarcRecord = dmarc.find((record) => record.toLowerCase().startsWith('v=dmarc1'))
    const smtp = sender.smtp ? await verifySmtp(sender) : { ok: false, error: 'SMTP ayarı yok' }
    results.push({
      id: sender.id,
      email: sender.email,
      provider: emailProviderLabel(),
      smtp: smtp.ok ? 'Bağlantı başarılı' : `Hata: ${smtp.error}`,
      spf: spfRecord ?? 'SPF kaydı bulunamadı',
      dmarc: dmarcRecord ?? 'DMARC kaydı bulunamadı',
      dkim: dkim.length ? `${selector} seçicisi bulundu` : `${selector} seçicisi için DKIM kaydı bulunamadı`,
    })
  }
  return results
}
