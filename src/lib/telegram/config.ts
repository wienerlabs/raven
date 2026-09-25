import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { getState, patchState, setState } from '@/lib/settings'
import { openSecret, sealSecret } from '@/lib/security/secrets'
import { randomToken } from '@/lib/security/tokens'

const KEY = 'telegram'

export const TEAM_CODE_TTL_MS = 15 * 60 * 1000

export const storedSchema = z.object({
  tokenSealed: z.string().nullable().default(null),
  botId: z.string().default(''),
  username: z.string().default(''),
  botName: z.string().default(''),
  webhookSecret: z.string().default(''),
  webhookSetAt: z.string().nullable().default(null),
  webhookError: z.string().nullable().default(null),
  teamChatId: z.string().default(''),
  teamChatTitle: z.string().default(''),
  teamLinkedAt: z.string().nullable().default(null),
  teamCode: z.string().default(''),
  teamCodeExpiresAt: z.string().nullable().default(null),
})

export type StoredTelegram = z.infer<typeof storedSchema>

export interface ResolvedTelegram {
  token: string | null
  username: string | null
  botName: string
  ready: boolean
  webhookSecret: string
  webhookSetAt: string | null
  webhookError: string | null
  team: { chatId: string; title: string; linkedAt: string | null } | null
  stored: StoredTelegram
}

export async function getStoredTelegram(db: Database): Promise<StoredTelegram> {
  const parsed = storedSchema.safeParse((await getState<unknown>(db, KEY)) ?? {})
  return parsed.success ? parsed.data : storedSchema.parse({})
}

export function resolveTelegramFrom(stored: StoredTelegram): ResolvedTelegram {
  const token = openSecret(stored.tokenSealed)
  const username = token && stored.username ? stored.username : null
  return {
    token,
    username,
    botName: stored.botName,
    ready: Boolean(token && username && stored.webhookSetAt),
    webhookSecret: stored.webhookSecret,
    webhookSetAt: stored.webhookSetAt,
    webhookError: stored.webhookError,
    team: token && stored.teamChatId ? { chatId: stored.teamChatId, title: stored.teamChatTitle, linkedAt: stored.teamLinkedAt } : null,
    stored,
  }
}

export async function resolveTelegram(db: Database): Promise<ResolvedTelegram> {
  return resolveTelegramFrom(await getStoredTelegram(db))
}

export async function saveTelegramBot(db: Database, input: { token: string; botId: string; username: string; botName: string }): Promise<StoredTelegram> {
  const current = await getStoredTelegram(db)
  const sameBot = current.botId === input.botId
  const next: StoredTelegram = {
    ...(sameBot ? current : storedSchema.parse({})),
    tokenSealed: sealSecret(input.token),
    botId: input.botId,
    username: input.username,
    botName: input.botName,
    webhookSecret: sameBot && current.webhookSecret ? current.webhookSecret : randomToken(32),
    webhookError: null,
  }
  await setState(db, KEY, next)
  return next
}

export async function recordWebhook(db: Database, result: { error: string | null; at?: Date }): Promise<void> {
  const at = result.at ?? new Date()
  await patchState(db, KEY, result.error ? { webhookError: result.error } : { webhookSetAt: at.toISOString(), webhookError: null })
}

export async function clearTelegramBot(db: Database): Promise<void> {
  await setState(db, KEY, storedSchema.parse({}))
}

export async function issueTeamCode(db: Database, now = new Date()): Promise<{ code: string; expiresAt: Date }> {
  const code = randomToken(18)
  const expiresAt = new Date(now.getTime() + TEAM_CODE_TTL_MS)
  await patchState(db, KEY, { teamCode: code, teamCodeExpiresAt: expiresAt.toISOString() })
  return { code, expiresAt }
}

export async function claimTeamCode(db: Database, code: string, chat: { id: string; title: string }, now = new Date()): Promise<'linked' | 'expired'> {
  if (!/^[A-Za-z0-9_-]{16,48}$/.test(code)) return 'expired'
  const nowIso = now.toISOString()
  const linked = await db
    .update(settings)
    .set({
      value: sql`${settings.value} || jsonb_build_object('teamChatId', ${chat.id}::text, 'teamChatTitle', ${chat.title.slice(0, 120)}::text, 'teamLinkedAt', ${nowIso}::text, 'teamCode', '', 'teamCodeExpiresAt', null)`,
      updatedAt: now,
    })
    .where(and(eq(settings.key, KEY), sql`${settings.value}->>'teamCode' = ${code}`, sql`(${settings.value}->>'teamCodeExpiresAt')::timestamptz > ${nowIso}::timestamptz`))
    .returning({ key: settings.key })
  return linked.length ? 'linked' : 'expired'
}

export async function unlinkTeamChat(db: Database): Promise<void> {
  await patchState(db, KEY, { teamChatId: '', teamChatTitle: '', teamLinkedAt: null, teamCode: '', teamCodeExpiresAt: null })
}

export type TelegramStepKey = 'bot' | 'webhook' | 'team'

export function telegramChecklist(resolved: ResolvedTelegram): Array<{ key: TelegramStepKey; done: boolean }> {
  return [
    { key: 'bot', done: Boolean(resolved.token && resolved.username) },
    { key: 'webhook', done: resolved.ready && !resolved.webhookError },
    { key: 'team', done: Boolean(resolved.team) },
  ]
}
