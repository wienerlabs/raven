import { z } from 'zod'

const mailServer = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive(),
  secure: z.boolean(),
  user: z.string().min(1),
  pass: z.string().min(1),
})

const senderSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1),
  email: z.email(),
  replyTo: z.email().optional(),
  dailyLimit: z.coerce.number().int().min(1).max(2000).default(80),
  smtp: mailServer.optional(),
  imap: mailServer.optional(),
})

export type SenderConfig = z.infer<typeof senderSchema>
export type EmailProvider = 'smtp' | 'resend' | 'console'

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function readSingleSender(env: NodeJS.ProcessEnv): unknown[] {
  if (!env.SENDER_EMAIL) return []
  const smtp = env.SMTP_HOST
    ? { host: env.SMTP_HOST, port: env.SMTP_PORT ?? '465', secure: flag(env.SMTP_SECURE, (env.SMTP_PORT ?? '465') === '465'), user: env.SMTP_USER ?? env.SENDER_EMAIL, pass: env.SMTP_PASS ?? '' }
    : undefined
  const imap = env.IMAP_HOST
    ? { host: env.IMAP_HOST, port: env.IMAP_PORT ?? '993', secure: flag(env.IMAP_SECURE, true), user: env.IMAP_USER ?? env.SMTP_USER ?? env.SENDER_EMAIL, pass: env.IMAP_PASS ?? env.SMTP_PASS ?? '' }
    : undefined
  return [
    {
      id: env.SENDER_ID ?? 'main',
      name: env.SENDER_NAME ?? 'Wiener Labs',
      email: env.SENDER_EMAIL,
      replyTo: env.REPLY_TO || undefined,
      dailyLimit: env.SENDER_DAILY_LIMIT ?? 80,
      smtp,
      imap,
    },
  ]
}

export function readSenders(env: NodeJS.ProcessEnv = process.env): SenderConfig[] {
  const raw = env.RAVEN_SENDERS?.trim() ? (JSON.parse(env.RAVEN_SENDERS) as unknown[]) : readSingleSender(env)
  return z.array(senderSchema).parse(raw)
}

export function emailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const value = (env.EMAIL_PROVIDER ?? 'console').toLowerCase()
  if (value === 'smtp' || value === 'resend') return value
  return 'console'
}

export function baseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RAVEN_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

export function aiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.RAVEN_AI_MODEL?.trim() || 'claude-opus-5-5'
}

export function replyModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = env.RAVEN_REPLY_MODEL?.trim() || 'claude-opus-5-5'
  const fallback = env.RAVEN_REPLY_FALLBACK_MODEL?.trim() || 'claude-sonnet-5'
  return primary === fallback ? [primary] : [primary, fallback]
}

export function hasAi(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim())
}

export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.RAVEN_SESSION_SECRET ?? ''
  if (secret.length >= 32) return secret
  if (env.NODE_ENV !== 'production') return 'raven-development-session-secret-change-me'
  throw new Error('RAVEN_SESSION_SECRET must be at least 32 characters')
}

export function adminPassword(env: NodeJS.ProcessEnv = process.env): string {
  const password = env.RAVEN_ADMIN_PASSWORD ?? ''
  if (password.length >= 12) return password
  if (env.NODE_ENV !== 'production') return password || 'raven-local'
  throw new Error('RAVEN_ADMIN_PASSWORD must be at least 12 characters')
}
