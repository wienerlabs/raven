import { createHmac } from 'node:crypto'
import { whatsappDigits } from '@/lib/contacts/phone'
import { safeEqual } from '@/lib/security/tokens'
import type { CloudConfig } from '@/lib/whatsapp/config'

export function waMeLink(phone: string, text: string): string {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`
}

export function chatReference(slug: string): string {
  return `R-${slug}`
}

export function findReference(text: string | null): string | null {
  if (!text) return null
  const match = /(?:^|[^0-9A-Za-z])R-([0-9A-Za-z]{10})(?![0-9A-Za-z])/.exec(text)
  return match ? match[1] : null
}

export function clickToChatText(input: { language: 'tr' | 'en'; company: string; solution: string; slug: string }): string {
  const reference = chatReference(input.slug)
  if (input.language === 'en') return `Hello, I am writing about the ${input.solution} brief you prepared for ${input.company}. (${reference})`
  return `Merhaba, ${input.company} için hazırladığınız ${input.solution} taslağı hakkında yazıyorum. (${reference})`
}

export interface TemplateSend {
  to: string
  greetingName: string
  company: string
  solution: string
  buttonSuffix: string
  language: string
}

function clean(value: string): string {
  return value.replace(/[\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 120)
}

export function templatePayload(input: TemplateSend, templateName: string) {
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

export interface TemplateDefinition {
  language: 'tr' | 'en'
  body: string
  footer: string
  button: string
  url: string
  example: { body: [string, string, string]; url: string }
}

export function templateDefinitions(base: string): TemplateDefinition[] {
  const url = `${base.replace(/\/+$/, '')}/r/{{1}}`
  return [
    {
      language: 'tr',
      body: 'Merhaba {{1}}, {{2}} için yapay zekâ destekli bir çözüm taslağı hazırladık: {{3}}. Nasıl çalışacağını kısa bir sayfada özetledik. Görüşmek isterseniz bu mesaja yanıt vermeniz yeterli.',
      footer: 'Wiener Labs · Mesaj istemezseniz DUR yazın',
      button: 'Taslağı aç',
      url,
      example: { body: ['Mert', 'Rotaport', 'Rota Asistanı'], url: 'ornek1234?m=t&s=wa' },
    },
    {
      language: 'en',
      body: 'Hello {{1}}, we prepared an AI solution brief for {{2}}: {{3}}. It fits on one short page. If you would like to talk, simply reply to this message.',
      footer: 'Wiener Labs · Reply STOP to opt out',
      button: 'Open the brief',
      url,
      example: { body: ['Mert', 'Rotaport', 'Route Assistant'], url: 'sample1234?m=t&s=wa' },
    },
  ]
}

export function templateText(language: 'tr' | 'en', values: { greetingName: string; company: string; solution: string }): string {
  const definitions = templateDefinitions('')
  const definition = definitions.find((item) => item.language === language) ?? definitions[0]
  const fill = [values.greetingName, values.company, values.solution].map(clean)
  return `${definition.body.replace(/\{\{([123])\}\}/g, (_, index: string) => fill[Number(index) - 1])}\n\n${definition.footer}`
}

export function templateCreatePayload(name: string, definition: TemplateDefinition) {
  return {
    name,
    language: definition.language,
    category: 'MARKETING',
    components: [
      { type: 'BODY', text: definition.body, example: { body_text: [definition.example.body] } },
      { type: 'FOOTER', text: definition.footer },
      { type: 'BUTTONS', buttons: [{ type: 'URL', text: definition.button, url: definition.url, example: [definition.example.url] }] },
    ],
  }
}

export interface WhatsappSendResult {
  providerId: string | null
  permanentFailure: boolean
  retryable: boolean
  error: string | null
}

const unsentNetworkCodes = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number }
}

async function graph<T>(config: CloudConfig, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: boolean; status: number; data: T & GraphError; networkCode: string | null; failure: string | null }> {
  try {
    const response = await fetch(`https://graph.facebook.com/${config.apiVersion}/${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    })
    const data = (await response.json().catch(() => ({}))) as T & GraphError
    return { ok: response.ok, status: response.status, data, networkCode: null, failure: response.ok ? null : `whatsapp ${response.status}: ${data.error?.message ?? 'unknown error'}` }
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause
    return { ok: false, status: 0, data: {} as T & GraphError, networkCode: cause?.code ?? null, failure: error instanceof Error ? error.message : String(error) }
  }
}

function sendResult(result: Awaited<ReturnType<typeof graph<{ messages?: Array<{ id: string }> }>>>): WhatsappSendResult {
  const id = result.data.messages?.[0]?.id
  if (result.ok && id) return { providerId: id, permanentFailure: false, retryable: false, error: null }
  if (result.status === 0) return { providerId: null, permanentFailure: false, retryable: Boolean(result.networkCode && unsentNetworkCodes.has(result.networkCode)), error: result.failure }
  const permanent = result.status >= 400 && result.status < 500 && result.status !== 429
  return { providerId: null, permanentFailure: permanent, retryable: result.status === 429 || result.status >= 500, error: result.failure }
}

export async function sendWhatsappTemplate(config: CloudConfig | null, input: TemplateSend): Promise<WhatsappSendResult> {
  if (!config) return { providerId: null, permanentFailure: false, retryable: false, error: 'WhatsApp Cloud API is not configured' }
  return sendResult(await graph<{ messages?: Array<{ id: string }> }>(config, `${config.phoneNumberId}/messages`, { method: 'POST', body: templatePayload(input, config.templateName) }))
}

export async function sendWhatsappText(config: CloudConfig, to: string, body: string): Promise<WhatsappSendResult> {
  const payload = { messaging_product: 'whatsapp', to: whatsappDigits(to), type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }
  return sendResult(await graph<{ messages?: Array<{ id: string }> }>(config, `${config.phoneNumberId}/messages`, { method: 'POST', body: payload }))
}

export async function phoneNumberInfo(config: CloudConfig): Promise<{ ok: true; displayNumber: string; name: string; quality: string } | { ok: false; error: string }> {
  const result = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(config, `${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`)
  if (!result.ok) return { ok: false, error: result.failure ?? 'unknown error' }
  return { ok: true, displayNumber: result.data.display_phone_number ?? '', name: result.data.verified_name ?? '', quality: result.data.quality_rating ?? '' }
}

export interface TemplateStatus {
  language: string
  status: string
  reason: string | null
}

export async function templateStatuses(config: CloudConfig): Promise<{ ok: true; templates: TemplateStatus[] } | { ok: false; error: string }> {
  if (!config.wabaId) return { ok: false, error: 'WhatsApp Business hesap kimliği (WABA ID) girilmemiş' }
  const result = await graph<{ data?: Array<{ language?: string; status?: string; rejected_reason?: string }> }>(config, `${config.wabaId}/message_templates?name=${encodeURIComponent(config.templateName)}&fields=name,language,status,rejected_reason&limit=20`)
  if (!result.ok) return { ok: false, error: result.failure ?? 'unknown error' }
  return {
    ok: true,
    templates: (result.data.data ?? []).map((row) => ({ language: row.language ?? '', status: row.status ?? '', reason: row.rejected_reason && row.rejected_reason !== 'NONE' ? row.rejected_reason : null })),
  }
}

export async function submitTemplates(config: CloudConfig, base: string): Promise<Array<{ language: string; ok: boolean; detail: string }>> {
  if (!config.wabaId) return [{ language: '', ok: false, detail: 'WhatsApp Business hesap kimliği (WABA ID) girilmemiş' }]
  const out: Array<{ language: string; ok: boolean; detail: string }> = []
  for (const definition of templateDefinitions(base)) {
    const result = await graph<{ id?: string; status?: string }>(config, `${config.wabaId}/message_templates`, { method: 'POST', body: templateCreatePayload(config.templateName, definition) })
    out.push({ language: definition.language, ok: result.ok, detail: result.ok ? (result.data.status ?? 'PENDING') : (result.failure ?? 'unknown error') })
  }
  return out
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
