export type ChatVia = 'whatsapp' | 'cloud' | 'manual' | 'template' | 'telegram' | 'panel' | 'bot'

export interface ChatMessage {
  id: string
  direction: 'in' | 'out'
  kind: 'reply' | 'first-touch' | 'start' | 'greeting'
  text: string
  at: Date
  via: ChatVia
  token?: string
}
