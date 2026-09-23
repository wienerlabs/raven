'use server'

import { after } from 'next/server'
import { and, count, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { contacts, responses, type Intent } from '@/lib/db/schema'
import { findMessageByToken, recordResponse } from '@/lib/campaign/state'
import { isTestToken, unsubscribeToken } from '@/lib/public'
import { getSettings } from '@/lib/settings'
import { notifyTeam } from '@/lib/notify'
import { intentLabels } from '@/lib/labels'

const intentSchema = z.enum(['meeting', 'info', 'later'])

async function contactForSlug(slug: string) {
  if (!/^[A-Za-z0-9]{6,32}$/.test(slug)) return null
  const db = await getDb()
  const rows = await db.select().from(contacts).where(eq(contacts.slug, slug)).limit(1)
  return rows[0] ?? null
}

async function messageFor(contactId: string, token: string | null) {
  if (!token) return null
  const db = await getDb()
  const message = await findMessageByToken(db, token)
  return message && message.contactId === contactId && !message.isTest ? message : null
}

async function fromTestEmail(token: string | null): Promise<boolean> {
  if (!token) return false
  const db = await getDb()
  return isTestToken(db, token)
}

export async function confirmIntent(slug: string, token: string | null, intent: string): Promise<{ ok: boolean }> {
  const parsed = intentSchema.safeParse(intent)
  const contact = await contactForSlug(slug)
  if (!parsed.success || !contact) return { ok: false }
  if (await fromTestEmail(token)) return { ok: true }
  const db = await getDb()
  const message = await messageFor(contact.id, token)
  const result = await recordResponse(db, { contactId: contact.id, messageId: message?.id, channel: message?.channel === 'whatsapp' ? 'whatsapp' : 'landing', kind: 'intent', intent: parsed.data })
  if (!result.duplicate) {
    after(async () => {
      const settings = await getSettings(db)
      await notifyTeam(settings, `${contact.firstName} ${contact.lastName}: ${intentLabels[parsed.data]}`, [contact.company, contact.email ?? contact.phone ?? '', `Kişi sayfası: /kisiler/${contact.id}`])
    })
  }
  return { ok: true }
}

const noteSchema = z.object({
  intent: z.enum(['meeting', 'info', 'later', 'other']),
  note: z.string().trim().min(2).max(2000),
  contact: z.string().trim().max(160),
})

export async function leaveNote(slug: string, token: string | null, _: { ok: boolean; message: string } | null, formData: FormData): Promise<{ ok: boolean; message: string }> {
  const contact = await contactForSlug(slug)
  const parsed = noteSchema.safeParse({ intent: formData.get('intent') ?? 'other', note: formData.get('note') ?? '', contact: formData.get('contact') ?? '' })
  const language = String(formData.get('lang') ?? 'tr') === 'en' ? 'en' : 'tr'
  if (!contact) return { ok: false, message: language === 'en' ? 'Page not found.' : 'Sayfa bulunamadı.' }
  if (!parsed.success) return { ok: false, message: language === 'en' ? 'Please write a short note.' : 'Lütfen kısa bir not yazın.' }
  if (await fromTestEmail(token)) return { ok: true, message: language === 'en' ? 'Test mode: the note was not saved.' : 'Test modu: not kaydedilmedi.' }
  const db = await getDb()
  const [recent] = await db
    .select({ value: count() })
    .from(responses)
    .where(and(eq(responses.contactId, contact.id), eq(responses.kind, 'form'), gte(responses.createdAt, new Date(Date.now() - 24 * 3600 * 1000))))
  if ((recent?.value ?? 0) >= 5) return { ok: false, message: language === 'en' ? 'We already received your notes today, thank you.' : 'Notlarınız bugün bize ulaştı, teşekkür ederiz.' }
  const message = await messageFor(contact.id, token)
  const body = parsed.data.contact ? `${parsed.data.note}\n\nİletişim tercihi: ${parsed.data.contact}` : parsed.data.note
  await recordResponse(db, { contactId: contact.id, messageId: message?.id, channel: 'landing', kind: 'form', intent: parsed.data.intent as Intent, body })
  after(async () => {
    const settings = await getSettings(db)
    await notifyTeam(settings, `${contact.firstName} ${contact.lastName} not bıraktı`, [contact.company, '', body])
  })
  return { ok: true, message: language === 'en' ? 'Thank you, we will get back to you within one business day.' : 'Teşekkürler, bir iş günü içinde size dönüyoruz.' }
}

export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  const db = await getDb()
  return { ok: await unsubscribeToken(db, token, 'page') }
}
