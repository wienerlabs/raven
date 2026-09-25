import type { Intent } from '@/lib/db/schema'

export interface InboundMail {
  from: string
  subject: string
  text: string
  inReplyTo: string | null
  references: string[]
  autoSubmitted: string | null
  autoReplyHeader: boolean
  contentType: string
  raw: string
}

export type InboundKind = 'bounce' | 'auto_reply' | 'reply'

export function classifyInbound(mail: InboundMail): InboundKind {
  const from = mail.from.toLowerCase()
  if (/mailer-daemon|postmaster|mail delivery (sub)?system|microsoftexchange/.test(from)) return 'bounce'
  if (/report-type="?delivery-status/i.test(mail.contentType)) return 'bounce'
  if (/(undeliver|delivery status notification|delivery failure|delivery has failed|mail delivery failed|returned mail|failure notice|teslim edilemedi|iletilemedi|gönderilemedi)/i.test(mail.subject)) return 'bounce'
  if (mail.autoSubmitted && mail.autoSubmitted.toLowerCase() !== 'no') return 'auto_reply'
  if (mail.autoReplyHeader) return 'auto_reply'
  if (/(out of office|out of the office|automatic reply|auto(matic)?[- ]?reply|autoreply|otomatik yan[ıi]t|ofis d[ıi][şs][ıi]nda|izindeyim|y[ıi]ll[ıi]k izin)/i.test(mail.subject)) return 'auto_reply'
  return 'reply'
}

export function extractMessageIds(value: string): string[] {
  return [...new Set(value.match(/<[^<>\s]+@[^<>\s]+>/g) ?? [])]
}

export function extractFailedRecipients(raw: string): string[] {
  const found = new Set<string>()
  for (const match of raw.matchAll(/(?:Final|Original)-Recipient:\s*rfc822;\s*<?([^\s<>;]+@[^\s<>;]+)>?/gi)) found.add(match[1].toLowerCase())
  return [...found]
}

const quoteMarkers = [
  /^>/,
  /^On .{2,300} wrote:\s*$/i,
  /^.{4,200} tarihinde .{0,200}yazd[ıi]:?\s*$/i,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^-{2,}\s*Orijinal İleti\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^From:\s/i,
  /^Kimden:\s/i,
  /^Gönderen:\s/i,
]

export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (quoteMarkers.some((marker) => marker.test(line.trim()))) break
    kept.push(line)
  }
  return kept.join('\n').trim()
}

export function wantsUnsubscribe(text: string): boolean {
  return /(listeden (beni )?[çc][ıi]kar|abonelikten [çc][ıi]k|bir daha (bana )?yazmay[ıi]n|e-?posta göndermeyin|mail atmay[ıi]n|unsubscribe|remove me|stop emailing|do not (contact|email) me)/i.test(text)
}

export function classifyReplyIntent(text: string): Intent {
  const value = text.toLowerCase()
  if (/(ilgilenmiyoruz|ilgilenmiyorum|not interested|gerek yok|ihtiyac[ıi]m[ıi]z yok|ihtiyac[ıi]m yok|şu an de[ğg]il|su an degil|no thanks|not now|uygun de[ğg]il)/.test(value)) return 'not_interested'
  if (/(görüşelim|görüşmek|gorusmek|gorusalim|görüşebiliriz|görüşme ayarla|konuşalım|konusalim|konuşabiliriz|toplant[ıi]|uygunum|müsaitim|musaitim|takvim|randevu|call|meeting|meet|schedule|let's talk|zoom|teams|google meet)/.test(value)) return 'meeting'
  if (/(detay|bilgi|sunum|döküman|doküman|dokuman|fiyat|teklif|details|more info|information|deck|pricing|proposal)/.test(value)) return 'info'
  return 'other'
}
