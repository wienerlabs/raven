import type { Language } from '@/lib/pitch/schema'

export interface EmailCopy {
  badge: string
  systemLabel: string
  openBrief: string
  quickReply: string
  meeting: string
  info: string
  later: string
  psLabel: string
  briefLine: string
  why: (company: string) => string
  source: (partner: string) => string
  privacy: string
  unsubscribe: string
  whatsappOptOut: string
  whatsappChat: string
  telegramChat: string
  whatsappChatHint: string
}

export const emailCopy: Record<Language, EmailCopy> = {
  tr: {
    badge: 'Size özel hazırlandı',
    systemLabel: 'Önerdiğimiz sistem',
    openBrief: 'Çözüm taslağını açın',
    quickReply: 'Tek tıkla yanıtlayın',
    meeting: 'Görüşelim',
    info: 'Önce detay gönderin',
    later: 'Şimdilik değil',
    psLabel: 'Not:',
    briefLine: 'Size özel taslak',
    why: (company) => `Bu e-postayı ${company} bünyesindeki göreviniz nedeniyle iş iletişimi kapsamında gönderdik.`,
    source: (partner) =>
      partner ? `İletişim bilgileriniz iş ortağımız ${partner} aracılığıyla edinilmiştir.` : 'İletişim bilgileriniz iş ortağımız aracılığıyla edinilmiştir.',
    privacy: 'Aydınlatma metni',
    unsubscribe: 'Bir daha yazmayalım',
    whatsappOptOut: 'Bu konuda tekrar yazmamı istemezseniz belirtmeniz yeterli.',
    whatsappChat: "WhatsApp'tan yazın",
    telegramChat: "Telegram'dan yazın",
    whatsappChatHint: 'Yazışmayı tercih ederseniz:',
  },
  en: {
    badge: 'Prepared for you',
    systemLabel: 'The system we propose',
    openBrief: 'Open your solution brief',
    quickReply: 'Reply in one click',
    meeting: "Let's talk",
    info: 'Send details first',
    later: 'Not right now',
    psLabel: 'P.S.',
    briefLine: 'Your personal brief',
    why: (company) => `We sent this email to you in your professional role at ${company}.`,
    source: (partner) => (partner ? `We received your business contact details through our partner ${partner}.` : 'We received your business contact details through a business partner.'),
    privacy: 'Privacy notice',
    unsubscribe: 'Do not email me again',
    whatsappOptOut: 'If you would rather not hear from me about this, just let me know.',
    whatsappChat: 'Message us on WhatsApp',
    telegramChat: 'Message us on Telegram',
    whatsappChatHint: 'Prefer chatting?',
  },
}
