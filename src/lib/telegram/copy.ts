import type { BotProfile } from '@/lib/channels/telegram'

export const TELEGRAM_START_NOTE = 'Sohbeti taslak sayfasından başlattı.'

export interface GreetingInput {
  name: string
  company: string
  solution: string
  team: string
}

interface BotCopy {
  greeting: (input: GreetingInput) => string
  welcomeBack: (name: string) => string
  unknown: (team: string) => string
  stopped: string
  description: (team: string) => string
  shortDescription: (team: string) => string
  commands: Array<{ command: string; description: string }>
}

export const telegramCopy: Record<'tr' | 'en', BotCopy> = {
  tr: {
    greeting: ({ name, company, solution, team }) =>
      `Merhaba ${name}, ${company} için hazırladığımız ${solution} taslağıyla ilgili sorularınızı buraya yazabilirsiniz. Mesajınız doğrudan ${team} ekibine ulaşır.\n\nBu konuda mesaj almak istemezseniz DUR yazmanız yeterli.`,
    welcomeBack: (name) => `Tekrar merhaba ${name}, mesajınızı buraya yazabilirsiniz.`,
    unknown: (team) => `Merhaba. Bu hesap ${team} ekibinin kişiye özel çözüm taslakları için açıldı. Size gönderilen taslak sayfasındaki Telegram düğmesiyle başlarsanız mesajınız doğru kişiye ulaşır.`,
    stopped: 'Anlaşıldı, bu konuda size bir daha yazmayacağız. Fikriniz değişirse buraya yazmanız yeterli.',
    description: (team) => `${team} ekibine buradan yazabilirsiniz. Size gönderilen kişisel taslak sayfasındaki Telegram düğmesiyle başlarsanız mesajınız doğru kişiye ulaşır.`,
    shortDescription: (team) => `${team} ekibine doğrudan yazın.`,
    commands: [
      { command: 'start', description: 'Sohbeti başlat' },
      { command: 'dur', description: 'Mesajları durdur' },
    ],
  },
  en: {
    greeting: ({ name, company, solution, team }) =>
      `Hello ${name}, you can send your questions about the ${solution} brief we prepared for ${company} right here. Your message goes straight to the ${team} team.\n\nIf you would rather not hear from us about this, reply STOP.`,
    welcomeBack: (name) => `Welcome back ${name}, you can write your message here.`,
    unknown: (team) => `Hello. This account belongs to the ${team} team and is used for personal solution briefs. Start from the Telegram button on the brief you received so your message reaches the right person.`,
    stopped: 'Understood, we will not write to you about this again. If you change your mind, just send a message here.',
    description: (team) => `Write to the ${team} team here. Start from the Telegram button on the personal brief you received so your message reaches the right person.`,
    shortDescription: (team) => `Write to the ${team} team directly.`,
    commands: [
      { command: 'start', description: 'Start the chat' },
      { command: 'stop', description: 'Stop messages' },
    ],
  },
}

export const teamCopy = {
  linked: 'Bu sohbet Raven bildirimlerine bağlandı. Yeni yanıtlar ve mesajlar buraya düşecek.',
  expired: 'Bu bağlantının süresi dolmuş. Raven panelindeki Telegram kurulumundan yeni bir bağlantı alın.',
  preview: 'Önizleme: bu sohbet kimseye bağlanmadı. Alıcı yukarıdaki mesajı görür.',
  test: 'Raven test bildirimi: bu sohbet ekip bildirimlerini alıyor.',
}

export const sampleGreeting: Omit<GreetingInput, 'team'> = { name: 'Mert', company: 'Rotaport', solution: 'Rota Asistanı' }

export function botProfiles(team: string): BotProfile[] {
  return (['tr', 'en'] as const).map((language) => ({
    language,
    description: telegramCopy[language].description(team),
    shortDescription: telegramCopy[language].shortDescription(team),
    commands: telegramCopy[language].commands,
  }))
}
