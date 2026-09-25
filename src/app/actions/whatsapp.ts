'use server'

import { asc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db'
import { contacts, pitches } from '@/lib/db/schema'
import { baseUrl, hasAi } from '@/lib/env'
import { requireAdmin } from '@/lib/security/session'
import { normalizePhone } from '@/lib/contacts/phone'
import { recordEvent } from '@/lib/campaign/state'
import { phoneNumberInfo, sendWhatsappTemplate, sendWhatsappText, submitTemplates, templateStatuses } from '@/lib/channels/whatsapp'
import { recordTemplateStatuses, resolveWhatsapp, saveWhatsappSettings } from '@/lib/whatsapp/config'
import { latestInbound, linkWhatsappSender, replyWindowOpen } from '@/lib/whatsapp/inbound'
import { setThreadHandled } from '@/lib/whatsapp/inbox'
import { checkSnippets, saveSnippets, type Snippet } from '@/lib/whatsapp/snippets'
import { AI_BUSY, draftReply } from '@/lib/ai/reply'
import { aiFailure } from '@/lib/ai/client'
import { takeAiBudget } from '@/lib/security/ai-budget'
import { replyContextFor } from '@/lib/ai/reply-context'
import type { ActionResult } from './contacts'

function refresh() {
  revalidatePath('/whatsapp')
  revalidatePath('/ayarlar')
  revalidatePath('/yanitlar')
}

export async function saveWhatsappAction(input: {
  businessNumber: string
  autoSend: boolean
  phoneNumberId: string
  wabaId: string
  templateName: string
  token: string
  appSecret: string
  clearToken: boolean
  clearAppSecret: boolean
}): Promise<ActionResult> {
  await requireAdmin()
  if (input.businessNumber.trim() && !normalizePhone(input.businessNumber)) return { ok: false, message: 'İş numarası okunamadı. +90 ile başlayan tam numarayı yazın.' }
  const db = await getDb()
  await saveWhatsappSettings(db, {
    businessNumber: String(input.businessNumber ?? '').slice(0, 40),
    autoSend: Boolean(input.autoSend),
    phoneNumberId: String(input.phoneNumberId ?? '').slice(0, 40),
    wabaId: String(input.wabaId ?? '').slice(0, 40),
    templateName: String(input.templateName ?? '').slice(0, 120),
    token: String(input.token ?? '').slice(0, 2000),
    appSecret: String(input.appSecret ?? '').slice(0, 400),
    clearToken: Boolean(input.clearToken),
    clearAppSecret: Boolean(input.clearAppSecret),
  })
  const resolved = await resolveWhatsapp(db)
  refresh()
  if (input.autoSend && !resolved.cloud) return { ok: true, message: 'Kaydedildi. Otomatik gönderim için erişim anahtarı ve telefon numarası kimliği de gerekli; o zamana kadar elle gönderim sürer.' }
  return { ok: true, message: 'WhatsApp ayarları kaydedildi.' }
}

export async function testWhatsappConnection(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const { cloud } = await resolveWhatsapp(db)
  if (!cloud) return { ok: false, message: 'Önce erişim anahtarını ve telefon numarası kimliğini kaydedin.' }
  const info = await phoneNumberInfo(cloud)
  if (!info.ok) return { ok: false, message: `Meta bağlantısı kurulamadı: ${info.error}` }
  return { ok: true, message: `Bağlantı çalışıyor: ${info.name || 'İşletme'} ${info.displayNumber}${info.quality ? `, kalite ${info.quality}` : ''}.` }
}

export async function submitWhatsappTemplates(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const { cloud } = await resolveWhatsapp(db)
  if (!cloud) return { ok: false, message: 'Önce erişim anahtarını, telefon numarası kimliğini ve WABA kimliğini kaydedin.' }
  const results = await submitTemplates(cloud, baseUrl())
  const failed = results.filter((item) => !item.ok)
  refresh()
  if (failed.length === results.length) return { ok: false, message: `Şablon gönderilemedi: ${failed.map((item) => item.detail).join('; ')}` }
  return { ok: true, message: `Şablon Meta onayına gönderildi (${results.map((item) => `${item.language || 'şablon'}: ${item.ok ? item.detail : 'hata'}`).join(', ')}). Onay genelde birkaç dakika ile birkaç saat sürer.` }
}

export async function refreshWhatsappTemplates(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const { cloud } = await resolveWhatsapp(db)
  if (!cloud) return { ok: false, message: 'Önce erişim anahtarını ve telefon numarası kimliğini kaydedin.' }
  const result = await templateStatuses(cloud)
  if (!result.ok) return { ok: false, message: result.error }
  await recordTemplateStatuses(db, result.templates)
  refresh()
  return { ok: true, message: result.templates.length ? 'Şablon durumu güncellendi.' : 'Bu adla kayıtlı şablon bulunamadı.' }
}

export async function sendWhatsappTest(to: string): Promise<ActionResult> {
  await requireAdmin()
  const phone = normalizePhone(to)
  if (!phone) return { ok: false, message: 'Numara okunamadı.' }
  const db = await getDb()
  const { cloud } = await resolveWhatsapp(db)
  if (!cloud) return { ok: false, message: 'Önce Cloud API ayarlarını kaydedin.' }
  const [sample] = await db
    .select({ slug: contacts.slug, content: pitches.content })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .orderBy(asc(contacts.createdAt))
    .limit(1)
  const result = await sendWhatsappTemplate(cloud, {
    to: phone,
    greetingName: sample?.content.person.greetingName ?? 'Baturalp',
    company: sample?.content.company.name ?? 'Wiener Labs',
    solution: sample?.content.solution.name ?? 'Raven',
    buttonSuffix: `${sample?.slug ?? 'ornek'}?onizleme=1`,
    language: sample?.content.language ?? 'tr',
  })
  if (result.error) return { ok: false, message: `Gönderilemedi: ${result.error}` }
  return { ok: true, message: 'Test mesajı gönderildi. Birkaç saniye içinde telefonunuza düşer.' }
}

export async function replyWhatsappAction(contactId: string, body: string): Promise<ActionResult> {
  await requireAdmin()
  const text = body.trim()
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (text.length < 2) return { ok: false, message: 'Mesaj boş.' }
  const db = await getDb()
  const { cloud } = await resolveWhatsapp(db)
  if (!cloud) return { ok: false, message: 'Panelden yanıt için WhatsApp Cloud API bağlantısı gerekli.' }
  const [contact] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return { ok: false, message: 'Kişi bulunamadı.' }
  const last = await latestInbound(db, contact.id)
  const to = last?.from ? normalizePhone(last.from) : null
  if (!last || !to) return { ok: false, message: 'Bu kişiden gelen bir WhatsApp mesajı yok.' }
  if (!replyWindowOpen(last.at)) return { ok: false, message: 'Son mesajın üzerinden 24 saat geçti. WhatsApp kuralı gereği artık yalnızca onaylı şablonla yazılabilir.' }
  const result = await sendWhatsappText(cloud, to, text)
  if (result.error) return { ok: false, message: `Gönderilemedi: ${result.error}` }
  await recordEvent(db, { contactId: contact.id, type: 'wa_reply', data: { text: text.slice(0, 1000), id: result.providerId, to } })
  await setThreadHandled(db, contact.id, true)
  refresh()
  return { ok: true, message: 'Yanıt WhatsApp üzerinden gönderildi.' }
}

export async function linkWhatsappNumberAction(contactId: string): Promise<ActionResult> {
  await requireAdmin()
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  const db = await getDb()
  const result = await linkWhatsappSender(db, contactId)
  refresh()
  revalidatePath(`/kisiler/${contactId}`)
  if (result.ok) return { ok: true, message: 'Numara kişiye bağlandı; bundan sonraki mesajları doğrulanmış olarak düşer.' }
  const reasons = {
    'no-message': 'Bağlanacak bir WhatsApp mesajı bulunamadı.',
    'has-phone': 'Kişinin kayıtlı başka bir numarası var. Değiştirmek için kişi sayfasından numarayı güncelleyin.',
    taken: 'Bu numara başka bir kişiye kayıtlı.',
  } as const
  return { ok: false, message: reasons[result.reason] }
}

const contactPattern = /^[0-9a-f-]{36}$/i

export async function draftWhatsappReplyAction(contactId: string): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const session = await requireAdmin()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (!hasAi()) return { ok: false, message: 'AI taslak için ANTHROPIC_API_KEY tanımlı olmalı.' }
  const db = await getDb()
  if (!(await takeAiBudget(db, session.sub))) return { ok: false, message: AI_BUSY }
  const context = await replyContextFor(db, contactId, 'whatsapp')
  if (!context) return { ok: false, message: 'Kişi bulunamadı.' }
  try {
    const draft = await draftReply(context)
    return { ok: true, text: draft.text }
  } catch (error) {
    console.error('reply draft failed', error)
    return { ok: false, message: aiFailure(error) }
  }
}

export async function markManualReplyAction(contactId: string, body: string): Promise<ActionResult> {
  await requireAdmin()
  const text = body.trim()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (text.length < 2 || text.length > 4000) return { ok: false, message: 'Mesaj 2 ile 4000 karakter arasında olmalı.' }
  const db = await getDb()
  const last = await latestInbound(db, contactId)
  const to = last?.from ? normalizePhone(last.from) : null
  if (!to) return { ok: false, message: 'Bu kişiden gelen bir WhatsApp mesajı yok.' }
  await recordEvent(db, { contactId, type: 'wa_reply', data: { text: text.slice(0, 1000), manual: true, to } })
  await setThreadHandled(db, contactId, true)
  refresh()
  return { ok: true, message: 'Yanıt kaydedildi.' }
}

export async function setWhatsappHandledAction(contactId: string, handled: boolean): Promise<ActionResult> {
  await requireAdmin()
  if (!contactPattern.test(contactId)) return { ok: false, message: 'Kişi bulunamadı.' }
  const db = await getDb()
  await setThreadHandled(db, contactId, handled === true)
  refresh()
  return { ok: true, message: handled ? 'Sohbet yanıtlandı olarak işaretlendi.' : 'Sohbet yeniden bekleyenlere alındı.' }
}

export async function saveSnippetsAction(items: Array<{ id?: string; title: string; body: string }>): Promise<ActionResult & { items?: Snippet[] }> {
  await requireAdmin()
  if (!Array.isArray(items)) return { ok: false, message: 'Liste okunamadı.' }
  const check = checkSnippets(items.map((item) => ({ id: typeof item.id === 'string' ? item.id : undefined, title: String(item.title ?? ''), body: String(item.body ?? '') })))
  if (!check.ok) return { ok: false, message: check.message }
  const db = await getDb()
  await saveSnippets(db, check.items)
  refresh()
  return { ok: true, message: check.items.length ? `${check.items.length} hazır yanıt kaydedildi.` : 'Liste boş kaydedildi; varsayılan yanıtlar kullanılacak.', items: check.items }
}
