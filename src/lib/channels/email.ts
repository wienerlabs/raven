import type { Transporter } from 'nodemailer'
import { emailProvider, readSenders, type EmailProvider, type SenderConfig } from '@/lib/env'

export interface OutgoingEmail {
  to: string
  replyTo: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  messageId: string
  inReplyTo?: string
  references?: string[]
}

export interface SendResult {
  providerId: string | null
  permanentFailure: boolean
  error: string | null
}

export interface EmailTransport {
  kind: EmailProvider
  send(email: OutgoingEmail, sender: SenderConfig): Promise<SendResult>
}

const transporters = new Map<string, Transporter>()

async function smtpTransporter(sender: SenderConfig): Promise<Transporter> {
  const cached = transporters.get(sender.id)
  if (cached) return cached
  if (!sender.smtp) throw new Error(`Sender ${sender.id} has no SMTP settings`)
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: sender.smtp.host,
    port: sender.smtp.port,
    secure: sender.smtp.secure,
    auth: { user: sender.smtp.user, pass: sender.smtp.pass },
    pool: false,
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })
  transporters.set(sender.id, transporter)
  return transporter
}

function isPermanentSmtp(error: unknown): boolean {
  const code = (error as { responseCode?: number }).responseCode
  return typeof code === 'number' && code >= 500 && code < 600 && code !== 552 && code !== 554
}

export const smtpTransport: EmailTransport = {
  kind: 'smtp',
  async send(email, sender) {
    try {
      const transporter = await smtpTransporter(sender)
      const info = await transporter.sendMail({
        from: { name: sender.name, address: sender.email },
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        references: email.references,
      })
      const rejected = (info.rejected ?? []).length > 0
      return { providerId: info.messageId ?? email.messageId, permanentFailure: rejected, error: rejected ? `rejected: ${String(info.rejected)}` : null }
    } catch (error) {
      return { providerId: null, permanentFailure: isPermanentSmtp(error), error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const resendTransport: EmailTransport = {
  kind: 'resend',
  async send(email, sender) {
    const key = process.env.RESEND_API_KEY
    if (!key) return { providerId: null, permanentFailure: false, error: 'RESEND_API_KEY is missing' }
    const headers: Record<string, string> = { ...email.headers }
    if (email.inReplyTo) headers['In-Reply-To'] = email.inReplyTo
    if (email.references?.length) headers.References = email.references.join(' ')
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': email.messageId.replace(/[<>]/g, '') },
        body: JSON.stringify({
          from: `${sender.name} <${sender.email}>`,
          to: [email.to],
          reply_to: email.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          headers,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
      if (response.ok && payload.id) return { providerId: payload.id, permanentFailure: false, error: null }
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429
      return { providerId: null, permanentFailure: permanent, error: `resend ${response.status}: ${payload.message ?? 'unknown error'}` }
    } catch (error) {
      return { providerId: null, permanentFailure: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
}

export const consoleTransport: EmailTransport = {
  kind: 'console',
  async send(email) {
    console.info(`[raven:console] to=${email.to} subject="${email.subject}" id=${email.messageId}`)
    return { providerId: `console:${email.messageId}`, permanentFailure: false, error: null }
  },
}

export function getTransport(kind: EmailProvider = emailProvider()): EmailTransport {
  if (kind === 'smtp') return smtpTransport
  if (kind === 'resend') return resendTransport
  return consoleTransport
}

export function activeSenders(): SenderConfig[] {
  const senders = readSenders()
  if (senders.length > 0) return senders
  return [{ id: 'console', name: 'Raven', email: 'raven@localhost.test', dailyLimit: 2000 }]
}

export function senderDomain(sender: SenderConfig): string {
  return sender.email.split('@')[1] ?? 'raven.local'
}

export async function verifySmtp(sender: SenderConfig): Promise<{ ok: boolean; error: string | null }> {
  try {
    const transporter = await smtpTransporter(sender)
    await transporter.verify()
    return { ok: true, error: null }
  } catch (error) {
    transporters.delete(sender.id)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function emailProviderLabel(kind: EmailProvider = emailProvider()): string {
  if (kind === 'smtp') return 'SMTP (kendi posta kutunuz)'
  if (kind === 'resend') return 'Resend API'
  return 'Konsol modu (gerçek gönderim yok)'
}
