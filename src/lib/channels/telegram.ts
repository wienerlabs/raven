import { safeEqual } from '@/lib/security/tokens'

const API_BASE = 'https://api.telegram.org'
const unsentNetworkCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

export const TELEGRAM_UPDATES = ['message', 'my_chat_member']
export const TELEGRAM_TEXT_LIMIT = 4096

export interface BotResponse<T> {
  ok: boolean
  status: number
  result: T | null
  error: string | null
  networkCode: string | null
}

interface Envelope<T> {
  ok?: boolean
  result?: T
  description?: string
  error_code?: number
}

export function isBotToken(value: string): boolean {
  return /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/.test(value)
}

function redact(text: string, token: string): string {
  return token ? text.split(token).join('***') : text
}

export async function botApi<T>(token: string, method: string, body: Record<string, unknown> = {}): Promise<BotResponse<T>> {
  if (!isBotToken(token)) return { ok: false, status: 0, result: null, error: 'telegram: invalid bot token', networkCode: null }
  try {
    const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await response.json().catch(() => ({}))) as Envelope<T>
    const ok = response.ok && data.ok === true
    return {
      ok,
      status: response.status,
      result: ok ? (data.result ?? null) : null,
      error: ok ? null : redact(`telegram ${data.error_code ?? response.status}: ${data.description ?? 'unknown error'}`, token),
      networkCode: null,
    }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause
    return { ok: false, status: 0, result: null, error: redact(error instanceof Error ? error.message : String(error), token), networkCode: cause?.code ?? null }
  }
}

export interface BotIdentity {
  id: string
  username: string
  name: string
}

export async function getBotIdentity(token: string): Promise<{ ok: true; bot: BotIdentity } | { ok: false; unauthorized: boolean; error: string }> {
  const response = await botApi<{ id?: number; is_bot?: boolean; first_name?: string; username?: string }>(token, 'getMe')
  const bot = response.result
  if (!response.ok || !bot) return { ok: false, unauthorized: response.status === 401 || response.status === 404 || !isBotToken(token), error: response.error ?? 'unknown error' }
  if (!bot.is_bot || !bot.username || bot.id === undefined) return { ok: false, unauthorized: true, error: 'telegram: token does not belong to a bot' }
  return { ok: true, bot: { id: String(bot.id), username: bot.username, name: bot.first_name ?? bot.username } }
}

export async function setBotWebhook(token: string, url: string, secret: string): Promise<{ ok: boolean; error: string | null }> {
  const response = await botApi<boolean>(token, 'setWebhook', { url, secret_token: secret, allowed_updates: TELEGRAM_UPDATES, max_connections: 1 })
  return { ok: response.ok, error: response.error }
}

export async function deleteBotWebhook(token: string): Promise<{ ok: boolean; error: string | null }> {
  const response = await botApi<boolean>(token, 'deleteWebhook', { drop_pending_updates: false })
  return { ok: response.ok, error: response.error }
}

export interface WebhookStatus {
  url: string
  pending: number
  lastErrorAt: Date | null
  lastError: string | null
}

export async function botWebhookStatus(token: string): Promise<{ ok: true; status: WebhookStatus } | { ok: false; error: string }> {
  const response = await botApi<{ url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string }>(token, 'getWebhookInfo')
  const info = response.result
  if (!response.ok || !info) return { ok: false, error: response.error ?? 'unknown error' }
  return {
    ok: true,
    status: {
      url: info.url ?? '',
      pending: info.pending_update_count ?? 0,
      lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000) : null,
      lastError: info.last_error_message || null,
    },
  }
}

export interface BotProfile {
  language: 'tr' | 'en'
  description: string
  shortDescription: string
  commands: Array<{ command: string; description: string }>
}

export async function configureBotProfile(token: string, profiles: BotProfile[]): Promise<number> {
  const calls = profiles.flatMap((profile) => {
    const scope = profile.language === 'tr' ? {} : { language_code: profile.language }
    return [
      botApi<boolean>(token, 'setMyCommands', { commands: profile.commands, ...scope }),
      botApi<boolean>(token, 'setMyDescription', { description: profile.description.slice(0, 512), ...scope }),
      botApi<boolean>(token, 'setMyShortDescription', { short_description: profile.shortDescription.slice(0, 120), ...scope }),
    ]
  })
  const results = await Promise.all(calls)
  return results.filter((result) => !result.ok).length
}

export interface TelegramSendResult {
  providerId: string | null
  blocked: boolean
  retryable: boolean
  error: string | null
}

export async function sendTelegramText(token: string, chatId: string, text: string, options: { preview?: boolean } = {}): Promise<TelegramSendResult> {
  const body: Record<string, unknown> = { chat_id: chatId, text: text.slice(0, TELEGRAM_TEXT_LIMIT) }
  if (options.preview === false) body.link_preview_options = { is_disabled: true }
  const response = await botApi<{ message_id?: number }>(token, 'sendMessage', body)
  const id = response.result?.message_id
  if (response.ok && id !== undefined) return { providerId: String(id), blocked: false, retryable: false, error: null }
  if (response.status === 0) return { providerId: null, blocked: false, retryable: Boolean(response.networkCode && unsentNetworkCodes.has(response.networkCode)), error: response.error }
  return { providerId: null, blocked: response.status === 403, retryable: response.status === 429 || response.status >= 500, error: response.error }
}

export function verifyTelegramSecret(header: string | null, secret: string): boolean {
  if (!header || !secret) return false
  return safeEqual(header, secret)
}

export interface TelegramUser {
  id: string
  username: string | null
  firstName: string
  lastName: string | null
  languageCode: string | null
}

export type TelegramEvent =
  | { kind: 'message'; updateId: number; chatId: string; chatType: string; chatTitle: string | null; messageId: number; from: TelegramUser | null; text: string | null; at: number }
  | { kind: 'membership'; updateId: number; chatId: string; chatType: string; chatTitle: string | null; status: string; at: number }

interface RawUser {
  id?: unknown
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

interface RawChat {
  id?: unknown
  type?: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

interface RawUpdate {
  update_id?: unknown
  message?: { message_id?: unknown; from?: RawUser; chat?: RawChat; date?: unknown; text?: unknown; caption?: unknown }
  my_chat_member?: { chat?: RawChat; date?: unknown; new_chat_member?: { status?: unknown } }
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function user(raw: RawUser | undefined): TelegramUser | null {
  const id = integer(raw?.id)
  if (!raw || id === null) return null
  return { id: String(id), username: raw.username || null, firstName: raw.first_name || '', lastName: raw.last_name || null, languageCode: raw.language_code || null }
}

function chatTitle(chat: RawChat): string | null {
  if (chat.title) return chat.title
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ')
  return name || (chat.username ? `@${chat.username}` : null)
}

export function parseTelegramUpdate(body: unknown): TelegramEvent | null {
  if (!body || typeof body !== 'object') return null
  const update = body as RawUpdate
  const updateId = integer(update.update_id) ?? 0
  const message = update.message
  const messageChat = integer(message?.chat?.id)
  const messageId = integer(message?.message_id)
  if (message?.chat && messageChat !== null && messageId !== null) {
    if (message.from?.is_bot) return null
    const text = typeof message.text === 'string' ? message.text : typeof message.caption === 'string' ? message.caption : null
    return { kind: 'message', updateId, chatId: String(messageChat), chatType: message.chat.type ?? 'private', chatTitle: chatTitle(message.chat), messageId, from: user(message.from), text, at: integer(message.date) ?? 0 }
  }
  const member = update.my_chat_member
  const memberChat = integer(member?.chat?.id)
  const status = member?.new_chat_member?.status
  if (member?.chat && memberChat !== null && typeof status === 'string') {
    return { kind: 'membership', updateId, chatId: String(memberChat), chatType: member.chat.type ?? 'private', chatTitle: chatTitle(member.chat), status, at: integer(member.date) ?? 0 }
  }
  return null
}

export type StartCommand = { kind: 'contact'; slug: string } | { kind: 'preview'; slug: string } | { kind: 'team'; code: string } | { kind: 'plain' } | { kind: 'unknown' }

export function parseStart(text: string | null): StartCommand | null {
  if (!text) return null
  const match = /^\/start(?:@[A-Za-z0-9_]{3,64})?(?:\s+(\S+))?\s*$/.exec(text.trim())
  if (!match) return null
  const payload = match[1]
  if (!payload) return { kind: 'plain' }
  const contact = /^r-([0-9A-Za-z]{6,32})$/.exec(payload)
  if (contact) return { kind: 'contact', slug: contact[1] }
  const preview = /^t-([0-9A-Za-z]{6,32})$/.exec(payload)
  if (preview) return { kind: 'preview', slug: preview[1] }
  const team = /^ekip-([A-Za-z0-9_-]{16,48})$/.exec(payload)
  if (team) return { kind: 'team', code: team[1] }
  return { kind: 'unknown' }
}

export function contactPayload(slug: string): string {
  return `r-${slug}`
}

export function previewPayload(slug: string): string {
  return `t-${slug}`
}

export function teamPayload(code: string): string {
  return `ekip-${code}`
}

export function startLink(username: string, payload: string): string {
  return `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(payload)}`
}

export function groupStartLink(username: string, payload: string): string {
  return `https://t.me/${encodeURIComponent(username)}?startgroup=${encodeURIComponent(payload)}`
}

const stopPattern = /^\/?(dur|stop|iptal|istemiyorum|unsubscribe|çık|cik)(@[a-z0-9_]+)?[.!]?$/

export function isTelegramStop(text: string | null): boolean {
  if (!text) return false
  const trimmed = text.trim()
  return [trimmed.toLocaleLowerCase('tr'), trimmed.toLowerCase()].some((value) => stopPattern.test(value))
}

export function telegramHandle(chat: { username: string | null; firstName: string | null; lastName: string | null }): string {
  if (chat.username) return `@${chat.username}`
  return [chat.firstName, chat.lastName].filter(Boolean).join(' ') || 'Telegram'
}
