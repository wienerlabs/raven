export type IntentKey = 'meeting' | 'info' | 'later'

export interface MessageLinks {
  landing: string
  intents: Record<IntentKey, string>
  unsubscribePage: string
  unsubscribeOneClick: string
  openPixel: string
  whatsappLanding: string
  whatsappChat: string
  telegramChat: string
}

export function buildLinks(baseUrl: string, slug: string, token: string): MessageLinks {
  const base = baseUrl.replace(/\/+$/, '')
  const landing = `${base}/r/${slug}?m=${token}`
  return {
    landing,
    intents: {
      meeting: `${base}/r/${slug}/yanit?n=meeting&m=${token}`,
      info: `${base}/r/${slug}/yanit?n=info&m=${token}`,
      later: `${base}/r/${slug}/yanit?n=later&m=${token}`,
    },
    unsubscribePage: `${base}/u/${token}`,
    unsubscribeOneClick: `${base}/api/unsubscribe/${token}`,
    openPixel: `${base}/api/track/open/${token}`,
    whatsappLanding: `${base}/r/${slug}?m=${token}&s=wa`,
    whatsappChat: `${base}/r/${slug}/whatsapp?m=${token}&s=email`,
    telegramChat: `${base}/r/${slug}/telegram?m=${token}&s=email`,
  }
}
