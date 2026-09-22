import type { AppSettings } from '@/lib/settings'
import { activeSenders, getTransport } from '@/lib/channels/email'
import { randomToken } from '@/lib/security/tokens'

export async function notifyTeam(settings: AppSettings, subject: string, lines: string[]): Promise<void> {
  const text = lines.join('\n')
  const tasks: Array<Promise<unknown>> = []
  const webhook = process.env.SLACK_WEBHOOK_URL
  if (webhook) {
    tasks.push(fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `*${subject}*\n${text}` }), signal: AbortSignal.timeout(8000) }))
  }
  if (settings.notifyEmail) {
    const transport = getTransport()
    const sender = activeSenders()[0]
    if (transport.kind !== 'console' && sender) {
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
