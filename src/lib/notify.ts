import type { AppSettings } from '@/lib/settings'
import type { SenderConfig } from '@/lib/env'
import { activeSenders, getTransport, resendTransport } from '@/lib/channels/email'
import { randomToken } from '@/lib/security/tokens'

export function systemSender(env: NodeJS.ProcessEnv = process.env): SenderConfig | null {
  const from = env.RAVEN_NOTIFY_FROM?.trim()
  if (!from || !env.RESEND_API_KEY?.trim()) return null
  const match = /^(.*)<([^<>]+)>$/.exec(from)
  const email = (match ? match[2] : from).trim()
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) return null
  const name = (match ? match[1] : '').trim().replace(/^"|"$/g, '') || 'Raven'
  return { id: 'system', name, email, dailyLimit: 2000 }
}

export function notificationChannel(env: NodeJS.ProcessEnv = process.env): 'resend' | 'campaign' | 'none' {
  if (systemSender(env)) return 'resend'
  return getTransport().kind === 'console' ? 'none' : 'campaign'
}

export async function notifyTeam(settings: AppSettings, subject: string, lines: string[]): Promise<void> {
  const text = lines.join('\n')
  const tasks: Array<Promise<unknown>> = []
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (webhook) {
    tasks.push(fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n${text}` }), signal: AbortSignal.timeout(8000) }))
  }
  if (settings.notifyEmail) {
    const system = systemSender()
    const transport = system ? resendTransport : getTransport()
    const sender = system ?? activeSenders()[0]
    if (sender && transport.kind !== 'console') {
      tasks.push(
        transport.send(
          {
            to: settings.notifyEmail,
            replyTo: sender.replyTo ?? sender.email,
            subject: `Raven: ${subject}`,
            text,
            html: `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre-wrap;">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`,
            headers: {},
            messageId: `<notify-${randomToken(9)}@${sender.email.split('@')[1]}>`,
          },
          sender,
        ),
      )
    }
  }
  await Promise.allSettled(tasks)
}
