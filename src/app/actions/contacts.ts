'use server'

import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { contacts, pitches, type ReviewStatus } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/security/session'
import { needsHold, REVIEW_CLEARED } from '@/lib/contacts/compliance'
import { recordEvent } from '@/lib/campaign/state'
import { normalizePhone } from '@/lib/contacts/phone'
import { checkPitch } from '@/lib/pitch/validate'
import { savePitch } from '@/lib/pitch/store'
import { generateForContact } from '@/lib/pitch/pipeline'
import { researchDomain } from '@/lib/research'
import { queueTestEmail } from '@/lib/campaign/launch'
import { dispatchDue } from '@/lib/campaign/dispatch'
import { hasAi } from '@/lib/env'
import type { Pitch } from '@/lib/pitch/schema'

export interface ActionResult {
  ok: boolean
  message: string
  errors?: string[]
}

const idsSchema = z.array(z.uuid()).min(1).max(1000)

function refresh(id?: string) {
  revalidatePath('/kisiler')
  revalidatePath('/')
  if (id) revalidatePath(`/kisiler/${id}`)
}

export async function bulkUpdate(ids: string[], action: 'approve' | 'pending' | 'hold' | 'exclude' | 'customer' | 'prospect'): Promise<ActionResult> {
  await requireAdmin()
  const parsed = idsSchema.safeParse(ids)
  if (!parsed.success) return { ok: false, message: 'Geçerli kişi seçilmedi.' }
  const db = await getDb()
  const now = new Date()
  if (action === 'customer' || action === 'prospect') {
    await db.update(contacts).set({ relationship: action, updatedAt: now }).where(inArray(contacts.id, parsed.data))
    refresh()
    return { ok: true, message: action === 'customer' ? 'Mevcut müşteri olarak işaretlendi. İçerikleri buna göre yeniden üretmeyi unutmayın.' : 'Aday olarak işaretlendi.' }
  }
  if (action === 'approve') {
    const rows = await db.select({ id: contacts.id, flags: contacts.flags }).from(contacts).innerJoin(pitches, eq(pitches.contactId, contacts.id)).where(inArray(contacts.id, parsed.data))
    const allowed = rows.filter((row) => !needsHold(row.flags)).map((row) => row.id)
    if (allowed.length) await db.update(contacts).set({ reviewStatus: 'approved', holdReason: null, updatedAt: now }).where(inArray(contacts.id, allowed))
    refresh()
    const skipped = parsed.data.length - allowed.length
    return { ok: true, message: `${allowed.length} kişi onaylandı.${skipped ? ` ${skipped} kişi içerik eksikliği veya hukuki inceleme nedeniyle atlandı.` : ''}` }
  }
  const map: Record<'pending' | 'hold' | 'exclude', ReviewStatus> = { pending: 'pending', hold: 'hold', exclude: 'excluded' }
  await db
    .update(contacts)
    .set({ reviewStatus: map[action], holdReason: action === 'hold' ? 'Elle beklemeye alındı' : null, updatedAt: now })
    .where(inArray(contacts.id, parsed.data))
  refresh()
  return { ok: true, message: `${parsed.data.length} kişi güncellendi.` }
}

export async function releaseHold(id: string, confirmation: string): Promise<ActionResult> {
  await requireAdmin()
  if (confirmation !== 'onaylıyorum') return { ok: false, message: 'Serbest bırakmak için onay metnini yazın.' }
  const db = await getDb()
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  if (!contact) return { ok: false, message: 'Kişi bulunamadı.' }
  const [pitch] = await db.select({ id: pitches.id }).from(pitches).where(eq(pitches.contactId, id)).limit(1)
  const flags = [...new Set([...contact.flags, REVIEW_CLEARED])]
  await db
    .update(contacts)
    .set({ flags, reviewStatus: pitch ? 'approved' : 'pending', holdReason: null, updatedAt: new Date() })
    .where(eq(contacts.id, id))
  await recordEvent(db, { contactId: id, type: 'review_cleared', data: { previousFlags: contact.flags, previousReason: contact.holdReason } })
  refresh(id)
  return { ok: true, message: pitch ? 'İnceleme kaydedildi ve kişi onaylandı.' : 'İnceleme kaydedildi. İçerik hazır olduğunda onaylayabilirsiniz.' }
}

export async function approveClean(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const rows = await db
    .select({ id: contacts.id, flags: contacts.flags, warnings: pitches.warnings })
    .from(contacts)
    .innerJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(eq(contacts.reviewStatus, 'pending')))
  const clean = rows.filter((row) => row.warnings.length === 0 && !needsHold(row.flags)).map((row) => row.id)
  for (let index = 0; index < clean.length; index += 500) {
    await db.update(contacts).set({ reviewStatus: 'approved', updatedAt: new Date() }).where(inArray(contacts.id, clean.slice(index, index + 500)))
  }
  refresh()
  return { ok: true, message: `${clean.length} kişi onaylandı. Uyarılı veya bekletilen kayıtlar incelemenizi bekliyor.` }
}

const contactForm = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(80),
  title: z.string().trim().max(160),
  company: z.string().trim().min(1).max(160),
  email: z.union([z.literal(''), z.email()]),
  phone: z.string().trim().max(40),
  relationship: z.enum(['prospect', 'customer']),
  notes: z.string().trim().max(2000),
  whatsappOptIn: z.boolean(),
})

export async function updateContact(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const parsed = contactForm.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') ?? '',
    title: formData.get('title') ?? '',
    company: formData.get('company'),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    phone: formData.get('phone') ?? '',
    relationship: formData.get('relationship'),
    notes: formData.get('notes') ?? '',
    whatsappOptIn: formData.get('whatsappOptIn') === 'on',
  })
  if (!parsed.success) return { ok: false, message: 'Form geçersiz.', errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) }
  const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : null
  if (parsed.data.phone && !phone) return { ok: false, message: 'Telefon numarası anlaşılamadı. Ülke koduyla yazın, örneğin +90 532 000 00 00.' }
  const db = await getDb()
  try {
    await db
      .update(contacts)
      .set({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        title: parsed.data.title || null,
        company: parsed.data.company,
        email: parsed.data.email || null,
        domain: parsed.data.email ? (parsed.data.email.split('@')[1] ?? null) : null,
        phone,
        relationship: parsed.data.relationship,
        notes: parsed.data.notes || null,
        whatsappOptIn: parsed.data.whatsappOptIn,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
  } catch {
    return { ok: false, message: 'Bu e-posta veya telefon başka bir kişide kayıtlı.' }
  }
  refresh(id)
  return { ok: true, message: 'Kişi bilgileri kaydedildi.' }
}

const editableFields = ['email.subject', 'email.subjectAlt', 'email.preheader', 'email.opening', 'email.body', 'email.cta', 'email.ps', 'solution.name', 'solution.tagline', 'landing.headline', 'landing.subheadline', 'whatsapp', 'followUps.0', 'followUps.1', 'person.salutation', 'person.greetingName'] as const

function setField(pitch: Pitch, field: (typeof editableFields)[number], value: string) {
  if (field === 'whatsapp') pitch.whatsapp = value
  else if (field === 'followUps.0') pitch.followUps[0] = { body: value }
  else if (field === 'followUps.1') pitch.followUps[1] = { body: value }
  else {
    const [group, key] = field.split('.') as [keyof Pitch, string]
    ;(pitch[group] as Record<string, unknown>)[key] = value
  }
}

export async function savePitchFields(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const [row] = await db.select().from(pitches).where(eq(pitches.contactId, id)).limit(1)
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  if (!row || !contact) return { ok: false, message: 'Bu kişi için içerik yok.' }
  const next = structuredClone(row.content)
  for (const field of editableFields) {
    const value = formData.get(field)
    if (typeof value === 'string') setField(next, field, value.replace(/\r\n/g, '\n').trim())
  }
  const check = checkPitch(next, { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company })
  if (!check.ok || !check.pitch) return { ok: false, message: 'Kaydedilmedi, düzeltilmesi gerekenler var.', errors: check.errors }
  await savePitch(db, id, check.pitch, { source: 'manual', warnings: check.warnings, approve: contact.reviewStatus === 'approved' })
  refresh(id)
  return { ok: true, message: check.warnings.length ? `Kaydedildi. ${check.warnings.length} uyarı var.` : 'Kaydedildi.', errors: check.warnings }
}

export async function savePitchJson(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  if (!contact) return { ok: false, message: 'Kişi bulunamadı.' }
  let value: unknown
  try {
    value = JSON.parse(String(formData.get('json') ?? ''))
  } catch (error) {
    return { ok: false, message: `JSON okunamadı: ${error instanceof Error ? error.message : String(error)}` }
  }
  const check = checkPitch(value, { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company })
  if (!check.ok || !check.pitch) return { ok: false, message: 'Kaydedilmedi.', errors: check.errors }
  await savePitch(db, id, check.pitch, { source: 'manual', warnings: check.warnings, approve: contact.reviewStatus === 'approved' })
  refresh(id)
  return { ok: true, message: 'İçerik kaydedildi.', errors: check.warnings }
}

export async function regenerate(id: string): Promise<ActionResult> {
  await requireAdmin()
  if (!hasAi()) return { ok: false, message: 'ANTHROPIC_API_KEY tanımlı değil. Ayarlar sayfasındaki kurulum adımlarına bakın.' }
  const db = await getDb()
  const outcome = await generateForContact(db, id)
  refresh(id)
  return outcome.ok ? { ok: true, message: `Yeni içerik üretildi${outcome.warnings ? `, ${outcome.warnings} uyarı var` : ''}. İnceleyip onaylayın.` } : { ok: false, message: outcome.error ?? 'Üretim başarısız.' }
}

export async function generateMissing(limit = 3): Promise<ActionResult & { remaining: number; done: number }> {
  await requireAdmin()
  if (!hasAi()) return { ok: false, message: 'ANTHROPIC_API_KEY tanımlı değil.', remaining: 0, done: 0 }
  const db = await getDb()
  const missing = await db
    .select({ id: contacts.id })
    .from(contacts)
    .leftJoin(pitches, eq(pitches.contactId, contacts.id))
    .where(and(isNull(pitches.id), notInArray(contacts.reviewStatus, ['excluded'])))
  const batch = missing.slice(0, Math.max(1, Math.min(limit, 5)))
  const outcomes = await Promise.all(batch.map((row) => generateForContact(db, row.id)))
  const failures = outcomes.filter((outcome) => !outcome.ok)
  refresh()
  return {
    ok: failures.length === 0,
    message: failures.length ? `${failures.length} kişide hata: ${failures[0].error}` : `${outcomes.length} içerik üretildi.`,
    remaining: missing.length - outcomes.filter((outcome) => outcome.ok).length,
    done: outcomes.filter((outcome) => outcome.ok).length,
  }
}

export async function researchContact(id: string): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1)
  if (!contact?.domain) return { ok: false, message: 'Alan adı yok.' }
  const result = await researchDomain(db, contact.domain, { refresh: true })
  refresh(id)
  return { ok: true, message: result.mxOk ? 'Web sitesi ve MX kayıtları güncellendi.' : 'Alan adında MX kaydı bulunamadı; bu adrese e-posta ulaşmayabilir.' }
}

export async function sendTest(id: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const recipient = z.email().safeParse(String(formData.get('recipient') ?? '').trim())
  const step = Number(formData.get('step') ?? 0)
  if (!recipient.success) return { ok: false, message: 'Geçerli bir test adresi yazın.' }
  if (![0, 1, 2].includes(step)) return { ok: false, message: 'Geçersiz adım.' }
  const db = await getDb()
  const [row] = await db.select().from(pitches).where(eq(pitches.contactId, id)).limit(1)
  if (!row) return { ok: false, message: 'Bu kişi için içerik yok.' }
  const queued = await queueTestEmail(db, id, recipient.data, step)
  const report = await dispatchDue(db, { limit: 1, messageIds: [queued.id] })
  refresh(id)
  if (report.errors.length) return { ok: false, message: `Gönderilemedi: ${report.errors[0]}` }
  return { ok: true, message: `Test e-postası ${recipient.data} adresine gönderildi.` }
}
