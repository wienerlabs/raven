import type { Intent, MessageStatus, ReviewStatus, Stage } from '@/lib/db/schema'

export const reviewLabels: Record<ReviewStatus, string> = {
  pending: 'İncelemede',
  approved: 'Onaylı',
  hold: 'Beklemede',
  excluded: 'Hariç',
}

export const stageLabels: Record<Stage, string> = {
  new: 'Yeni',
  queued: 'Sırada',
  contacted: 'Gönderildi',
  engaged: 'İlgilendi',
  replied: 'Yanıt verdi',
  meeting: 'Görüşme istiyor',
  declined: 'Şimdilik değil',
  unsubscribed: 'Çıktı',
  bounced: 'Geri döndü',
}

export const intentLabels: Record<Intent, string> = {
  meeting: 'Görüşme',
  info: 'Detay istiyor',
  later: 'Şimdilik değil',
  not_interested: 'İlgilenmiyor',
  other: 'Diğer',
}

export const messageStatusLabels: Record<MessageStatus, string> = {
  scheduled: 'Planlandı',
  sending: 'Gönderiliyor',
  sent: 'Gönderildi',
  failed: 'Başarısız',
  cancelled: 'İptal',
  manual: 'Elle gönderilecek',
}

export const flagLabels: Record<string, string> = {
  'name-from-email': 'Hitap e-postadan',
  'name-uncertain': 'Soyad belirsiz',
  'company-uncertain': 'Şirket belirsiz',
  'generic-mailbox': 'Ortak kutu',
  'email-name-mismatch': 'E-posta ve isim uyuşmuyor',
  'title-missing': 'Ünvan yok',
  'crypto-company': 'Kripto şirketi',
  'sanctions-review': 'Yaptırım incelemesi',
  'jurisdiction-review': 'Yargı alanı incelemesi',
  'review-cleared': 'İnceleme tamamlandı',
}

export const stepLabels = ['İlk e-posta', 'Takip 1', 'Takip 2']

export const eventLabels: Record<string, string> = {
  sent: 'E-posta gönderildi',
  test_sent: 'Test gönderildi',
  view: 'Taslak sayfası açıldı',
  open: 'E-posta açıldı',
  click: 'Yanıt bağlantısına tıklandı',
  response: 'Yanıt kaydedildi',
  auto_reply: 'Otomatik yanıt',
  bounce: 'Geri döndü',
  unsubscribe: 'Listeden çıktı',
  wa_sent: 'WhatsApp gönderildi',
  wa_delivered: 'WhatsApp iletildi',
  wa_read: 'WhatsApp okundu',
  wa_failed: 'WhatsApp başarısız',
  wa_inbound: 'WhatsApp mesajı geldi',
  wa_reply: 'WhatsApp yanıtı gönderildi',
  wa_click: "WhatsApp'tan yazmak için tıkladı",
  wa_linked: 'WhatsApp numarası eşleşti',
  tg_click: "Telegram'dan yazmak için tıkladı",
  tg_inbound: 'Telegram mesajı geldi',
  tg_greeting: 'Telegram karşılama mesajı gitti',
  tg_reply: 'Telegram yanıtı gönderildi',
  tg_blocked: 'Telegram botunu engelledi',
  tg_unblocked: 'Telegram botunun engelini kaldırdı',
  tg_moved: 'Telegram hesabı başka bir kişinin taslağına geçti',
  complaint: 'Spam şikâyeti',
  delivered: 'Teslim edildi',
  review_cleared: 'Hukuki inceleme tamamlandı',
  dwell: 'Sayfada kalma süresi',
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function percent(part: number, whole: number): string {
  if (!whole) return '%0'
  return `%${Math.round((part / whole) * 1000) / 10}`
}
