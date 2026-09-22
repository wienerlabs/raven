import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { defaultOffer, defaultSender } from './defaults'

export const appSettingsSchema = z.object({
  sender: z.object({
    fullName: z.string().trim().min(2).max(80),
    firstName: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(80),
    company: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40),
    website: z.string().trim().max(120),
  }),
  offer: z.string().trim().min(40).max(2000),
  calendarUrl: z.string().trim().max(300),
  notifyEmail: z.string().trim().max(200),
  partnerName: z.string().trim().max(120),
  legal: z.object({
    companyName: z.string().trim().max(160),
    address: z.string().trim().max(300),
    contactEmail: z.string().trim().max(200),
    mersis: z.string().trim().max(40),
  }),
  tracking: z.object({ opens: z.boolean() }),
})

export type AppSettings = z.infer<typeof appSettingsSchema>

export const defaultSettings: AppSettings = {
  sender: defaultSender,
  offer: defaultOffer,
  calendarUrl: '',
  notifyEmail: '',
  partnerName: '',
  legal: { companyName: 'Wiener Labs', address: '', contactEmail: '', mersis: '' },
  tracking: { opens: false },
}

const KEY = 'app'

function merge(stored: unknown): AppSettings {
  const value = (stored ?? {}) as Partial<AppSettings>
  const merged = {
    ...defaultSettings,
    ...value,
    sender: { ...defaultSettings.sender, ...(value.sender ?? {}) },
    legal: { ...defaultSettings.legal, ...(value.legal ?? {}) },
    tracking: { ...defaultSettings.tracking, ...(value.tracking ?? {}) },
  }
  const parsed = appSettingsSchema.safeParse(merged)
  return parsed.success ? parsed.data : defaultSettings
}

export async function getSettings(db: Database): Promise<AppSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1)
  return merge(rows[0]?.value)
}

export async function saveSettings(db: Database, next: AppSettings): Promise<AppSettings> {
  const value = appSettingsSchema.parse(next)
  await db
    .insert(settings)
    .values({ key: KEY, value: value as unknown as Record<string, unknown> })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as unknown as Record<string, unknown>, updatedAt: new Date() } })
  return value
}

export async function getState<T>(db: Database, key: string): Promise<T | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return (rows[0]?.value as T | undefined) ?? null
}

export async function setState<T extends object>(db: Database, key: string, value: T): Promise<void> {
  const json = value as unknown as Record<string, unknown>
  await db.insert(settings).values({ key, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt: new Date() } })
}
