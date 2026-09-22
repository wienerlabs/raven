import { createHmac } from 'node:crypto'
import { whatsappCloud } from '@/lib/env'
import { whatsappDigits } from '@/lib/contacts/phone'
import { safeEqual } from '@/lib/security/tokens'

export function waMeLink(phone: string, text: string): string {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`
}

export interface TemplateSend {
  to: string
  greetingName: string
  company: string
  solution: string
  buttonSuffix: string
  language: string
}

export function templatePayload(input: TemplateSend, templateName: string) {
  const clean = (value: string) => value.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 120)
  return {
    messaging_product: 'whatsapp',
    to: whatsappDigits(input.to),
    type: 'template',
    template: {
      name: templateName,
      language: { code: input.language },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: clean(input.greetingName) },
            { type: 'text', text: clean(input.company) },
            { type: 'text', text: clean(input.solution) },
          ],
        },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.buttonSuffix }] },
      ],
    },
  }
}

export interface WhatsappSendResult {
  providerId: string | null
  permanentFailure: boolean
  error: string | null
}

export async function sendWhatsappTemplate(input: TemplateSend): Promise<WhatsappSendResult> {
  const config = whatsappCloud()
  if (!config.token || !config.phoneNumberId) return { providerId: null, permanentFailure: false, error: 'WhatsApp Cloud API is not configured' }
  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(templatePayload(input, config.templateName)),
      signal: AbortSignal.timeout(20_000),
    })
    const payload = (await response.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } }
    const id = payload.messages?.[0]?.id
    if (response.ok && id) return { providerId: id, permanentFailure: false, error: null }
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 429
    return { providerId: null, permanentFailure: permanent, error: `whatsapp ${response.status}: ${payload.error?.message ?? 'unknown error'}` }
  } catch (error) {
    return { providerId: null, permanentFailure: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  return safeEqual(header, expected)
}

export interface WhatsappWebhookEvent {
  kind: 'status' | 'message'
  providerId: string | null
  status: string | null
  from: string | null
  text: string | null
  timestamp: number | null
}

interface WebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id?: string; status?: string; recipient_id?: string; timestamp?: string }>
        messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string } }; timestamp?: string }>
      }
    }>
  }>
}

export function parseWhatsappWebhook(body: unknown): WhatsappWebhookEvent[] {
  const events: WhatsappWebhookEvent[] = []
  for (const entry of (body as WebhookBody).entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        events.push({ kind: 'status', providerId: status.id ?? null, status: status.status ?? null, from: status.recipient_id ?? null, text: null, timestamp: status.timestamp ? Number(status.timestamp) : null })
      }
      for (const message of change.value?.messages ?? []) {
        const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? null
        events.push({ kind: 'message', providerId: message.id ?? null, status: null, from: message.from ?? null, text, timestamp: message.timestamp ? Number(message.timestamp) : null })
      }
    }
  }
  return events
}

export function isStopWord(text: string | null): boolean {
  if (!text) return false
  return /^(dur|stop|iptal|istemiyorum|unsubscribe|çık|cik)\b/i.test(text.trim())
}
