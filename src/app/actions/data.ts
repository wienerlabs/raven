'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db'
import { contacts, domains, messages, responses } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/security/session'
import { importContacts, parseSpreadsheet } from '@/lib/contacts/import'
import { importPitchMap } from '@/lib/pitch/import'
import { researchDomain } from '@/lib/research'
import { freeMailDomains } from '@/lib/research/website'
import { recordEvent, moveStage } from '@/lib/campaign/state'
import { randomToken } from '@/lib/security/tokens'
import type { ActionResult } from './contacts'

const MAX_UPLOAD = 8 * 1024 * 1024

export async function importFileAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Bir Excel veya CSV dosyası seçin.' }
  if (file.size > MAX_UPLOAD) return { ok: false, message: 'Dosya 8 MB sınırını aşıyor.' }
  if (!/\.(xlsx|csv|tsv|txt)$/i.test(file.name)) return { ok: false, message: 'Desteklenen biçimler: .xlsx, .csv' }
  const buffer = new Uint8Array(await file.arrayBuffer())
  const parsed = await parseSpreadsheet(buffer, file.name)
  if (parsed.rows.length === 0) return { ok: false, message: 'Dosyada okunabilir satır bulunamadı. Başlık satırında ad, şirket ve e-posta veya telefon sütunları olmalı.' }
  const db = await getDb()
  const summary = await importContacts(db, parsed.rows, file.name, parsed.skipped)
  revalidatePath('/kisiler')
  revalidatePath('/')
  return {
    ok: true,
    message: `${summary.created} yeni kişi eklendi, ${summary.updated} kişi güncellendi, ${summary.skipped} satır atlandı.${summary.held ? ` ${summary.held} kişi hukuki inceleme için beklemeye alındı.` : ''}`,
  }
}

export async function importPitchesAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Bir JSON dosyası seçin.' }
  if (file.size > MAX_UPLOAD) return { ok: false, message: 'Dosya 8 MB sınırını aşıyor.' }
  let map: Record<string, unknown>
  try {
    map = JSON.parse(await file.text()) as Record<string, unknown>
  } catch {
    return { ok: false, message: 'JSON okunamadı.' }
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { ok: false, message: 'Beklenen biçim: e-posta adresi anahtarlı bir JSON nesnesi.' }
  const db = await getDb()
  const summary = await importPitchMap(db, map, { approveClean: formData.get('approveClean') === 'on' })
  revalidatePath('/kisiler')
  revalidatePath('/')
  const errors = [...summary.invalid.map((item) => `${item.email}: ${item.errors.slice(0, 2).join('; ')}`), ...summary.missingContact.slice(0, 20).map((email) => `${email}: kişi bulunamadı`)]
  return { ok: summary.invalid.length === 0, message: `${summary.saved} içerik kaydedildi, ${summary.approved} tanesi onaylandı.`, errors }
}

export async function researchMissing(limit = 6): Promise<ActionResult & { remaining: number }> {
  await requireAdmin()
  const db = await getDb()
  const rows = await db
    .selectDistinct({ domain: contacts.domain })
    .from(contacts)
    .leftJoin(domains, eq(domains.domain, contacts.domain))
    .where(and(isNull(domains.domain)))
  const pending = rows.map((row) => row.domain).filter((domain): domain is string => Boolean(domain) && !freeMailDomains.has(domain as string))
  const batch = pending.slice(0, Math.max(1, Math.min(limit, 10)))
  await Promise.all(batch.map((domain) => researchDomain(db, domain)))
  revalidatePath('/kisiler')
  return { ok: true, message: `${batch.length} alan adı araştırıldı.`, remaining: Math.max(0, pending.length - batch.length) }
}

export async function markHandled(id: string, handled: boolean): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  await db.update(responses).set({ handled, handledAt: handled ? new Date() : null }).where(eq(responses.id, id))
  revalidatePath('/yanitlar')
  revalidatePath('/')
  return { ok: true, message: handled ? 'Yanıtlandı olarak işaretlendi.' : 'Tekrar açıldı.' }
}

export async function markWhatsappSent(messageId: string): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const [message] = await db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.channel, 'whatsapp'))).limit(1)
  if (!message) return { ok: false, message: 'Mesaj bulunamadı.' }
  const now = new Date()
  await db.update(messages).set({ status: 'sent', sentAt: now, updatedAt: now, lastError: null }).where(eq(messages.id, messageId))
  await recordEvent(db, { contactId: message.contactId, messageId, type: 'wa_sent', data: { mode: 'manual' }, at: now })
  await moveStage(db, message.contactId, 'contacted')
  revalidatePath('/whatsapp')
  return { ok: true, message: 'Gönderildi olarak işaretlendi.' }
}

export async function queueWhatsapp(contactIds: string[]): Promise<ActionResult> {
  await requireAdmin()
  if (!contactIds.length) return { ok: false, message: 'Kişi seçilmedi.' }
  const db = await getDb()
  const rows = await db.select({ id: contacts.id, phone: contacts.phone }).from(contacts).where(inArray(contacts.id, contactIds))
  const withPhone = rows.filter((row) => row.phone)
  if (withPhone.length === 0) return { ok: false, message: 'Seçilen kişilerde telefon yok.' }
  await db.insert(messages).values(withPhone.map((row) => ({ token: randomToken(16), contactId: row.id, channel: 'whatsapp' as const, step: 0, status: 'manual' as const })))
  revalidatePath('/whatsapp')
  return { ok: true, message: `${withPhone.length} kişi WhatsApp kuyruğuna eklendi.` }
}

export async function cancelWhatsapp(messageId: string): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  await db.update(messages).set({ status: 'cancelled', lastError: 'cancelled from WhatsApp queue', updatedAt: new Date() }).where(and(eq(messages.id, messageId), eq(messages.channel, 'whatsapp')))
  revalidatePath('/whatsapp')
  return { ok: true, message: 'Kuyruktan çıkarıldı.' }
}
