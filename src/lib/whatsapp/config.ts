import { z } from 'zod'
import type { Database } from '@/lib/db'
import { getState, setState } from '@/lib/settings'
import { normalizePhone } from '@/lib/contacts/phone'
import { openSecret, sealSecret } from '@/lib/security/secrets'
import { randomToken } from '@/lib/security/tokens'

const KEY = 'whatsapp'

export const storedSchema = z.object({
  businessNumber: z.string().default(''),
  autoSend: z.boolean().default(false),
  phoneNumberId: z.string().default(''),
  wabaId: z.string().default(''),
  templateName: z.string().default('raven_intro'),
  apiVersion: z.string().default('v23.0'),
  verifyToken: z.string().default(''),
  tokenSealed: z.string().nullable().default(null),
  appSecretSealed: z.string().nullable().default(null),
  webhookVerifiedAt: z.string().nullable().default(null),
  templates: z.array(z.object({ language: z.string(), status: z.string(), reason: z.string().nullable() })).default([]),
  templatesCheckedAt: z.string().nullable().default(null),
})

export type StoredWhatsapp = z.infer<typeof storedSchema>

export interface CloudConfig {
  token: string
  phoneNumberId: string
  wabaId: string
  templateName: string
  apiVersion: string
}

export interface ResolvedWhatsapp {
  mode: 'cloud' | 'manual'
  businessNumber: string | null
  cloud: CloudConfig | null
  verifyToken: string
  appSecret: string
  autoSend: boolean
  hasToken: boolean
  hasAppSecret: boolean
  webhookVerifiedAt: string | null
  stored: StoredWhatsapp
}

export async function getStoredWhatsapp(db: Database): Promise<StoredWhatsapp> {
  const parsed = storedSchema.safeParse((await getState<unknown>(db, KEY)) ?? {})
  return parsed.success ? parsed.data : storedSchema.parse({})
}

export async function ensureVerifyToken(db: Database): Promise<StoredWhatsapp> {
  const stored = await getStoredWhatsapp(db)
  if (stored.verifyToken) return stored
  const next = { ...stored, verifyToken: randomToken(24) }
  await setState(db, KEY, next)
  return next
}

export function resolveFrom(stored: StoredWhatsapp, env: NodeJS.ProcessEnv = process.env): ResolvedWhatsapp {
  const token = openSecret(stored.tokenSealed) ?? env.WHATSAPP_TOKEN?.trim() ?? ''
  const appSecret = openSecret(stored.appSecretSealed) ?? env.WHATSAPP_APP_SECRET?.trim() ?? ''
  const phoneNumberId = stored.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID?.trim() || ''
  const autoSend = stored.autoSend || env.WHATSAPP_MODE?.toLowerCase() === 'cloud'
  const cloud = token && phoneNumberId ? { token, phoneNumberId, wabaId: stored.wabaId || env.WHATSAPP_WABA_ID?.trim() || '', templateName: stored.templateName || env.WHATSAPP_TEMPLATE_NAME || 'raven_intro', apiVersion: stored.apiVersion || env.WHATSAPP_API_VERSION || 'v23.0' } : null
  return {
    mode: autoSend && cloud ? 'cloud' : 'manual',
    businessNumber: normalizePhone(stored.businessNumber || env.WHATSAPP_BUSINESS_NUMBER || '') ?? null,
    cloud,
    verifyToken: stored.verifyToken || env.WHATSAPP_VERIFY_TOKEN?.trim() || '',
    appSecret,
    autoSend,
    hasToken: Boolean(token),
    hasAppSecret: Boolean(appSecret),
    webhookVerifiedAt: stored.webhookVerifiedAt,
    stored,
  }
}

export async function resolveWhatsapp(db: Database, env: NodeJS.ProcessEnv = process.env): Promise<ResolvedWhatsapp> {
  return resolveFrom(await getStoredWhatsapp(db), env)
}

export interface WhatsappSettingsInput {
  businessNumber: string
  autoSend: boolean
  phoneNumberId: string
  wabaId: string
  templateName: string
  token: string
  appSecret: string
  clearToken?: boolean
  clearAppSecret?: boolean
}

export async function saveWhatsappSettings(db: Database, input: WhatsappSettingsInput): Promise<StoredWhatsapp> {
  const current = await ensureVerifyToken(db)
  const token = input.token.trim()
  const appSecret = input.appSecret.trim()
  const next: StoredWhatsapp = {
    ...current,
    businessNumber: input.businessNumber.trim() ? (normalizePhone(input.businessNumber) ?? current.businessNumber) : '',
    autoSend: input.autoSend,
    phoneNumberId: input.phoneNumberId.replace(/\D/g, ''),
    wabaId: input.wabaId.replace(/\D/g, ''),
    templateName: /^[a-z0-9_]{1,512}$/.test(input.templateName.trim()) ? input.templateName.trim() : current.templateName,
    tokenSealed: input.clearToken ? null : token ? sealSecret(token) : current.tokenSealed,
    appSecretSealed: input.clearAppSecret ? null : appSecret ? sealSecret(appSecret) : current.appSecretSealed,
  }
  await setState(db, KEY, next)
  return next
}

export async function recordTemplateStatuses(db: Database, templates: StoredWhatsapp['templates'], at = new Date()): Promise<void> {
  const current = await getStoredWhatsapp(db)
  await setState(db, KEY, { ...current, templates, templatesCheckedAt: at.toISOString() })
}

export async function markWebhookVerified(db: Database, at = new Date()): Promise<void> {
  const current = await getStoredWhatsapp(db)
  await setState(db, KEY, { ...current, webhookVerifiedAt: at.toISOString() })
}
