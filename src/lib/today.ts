import { and, count, countDistinct, eq, ne } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, messages, pitches, responses } from '@/lib/db/schema'
import { whatsappInbox } from '@/lib/whatsapp/inbox'

export interface TodayTask {
  key: string
  count: number
  label: string
  detail: string | null
  href: string
  urgent: boolean
}

const CLOSING_SOON_MS = 3 * 60 * 60 * 1000

export async function todayTasks(db: Database, now = new Date()): Promise<TodayTask[]> {
  const [[meetings], [replies], [manual], [pending], [holds], inbox] = await Promise.all([
    db
      .select({ value: countDistinct(responses.contactId) })
      .from(responses)
      .where(and(eq(responses.handled, false), eq(responses.intent, 'meeting'), ne(responses.kind, 'auto_reply'), ne(responses.channel, 'whatsapp'))),
    db
      .select({ value: count() })
      .from(responses)
      .where(and(eq(responses.handled, false), ne(responses.kind, 'auto_reply'), ne(responses.channel, 'whatsapp'), ne(responses.intent, 'meeting'))),
    db.select({ value: count() }).from(messages).where(and(eq(messages.channel, 'whatsapp'), eq(messages.status, 'manual'))),
    db.select({ value: count() }).from(contacts).innerJoin(pitches, eq(pitches.contactId, contacts.id)).where(eq(contacts.reviewStatus, 'pending')),
    db.select({ value: count() }).from(contacts).where(eq(contacts.reviewStatus, 'hold')),
    whatsappInbox(db),
  ])
  const waiting = inbox.threads.filter((thread) => thread.unhandled > 0)
  const closing = waiting.filter((thread) => thread.windowClosesAt.getTime() > now.getTime() && thread.windowClosesAt.getTime() - now.getTime() < CLOSING_SOON_MS)
  const tasks: TodayTask[] = [
    { key: 'meetings', count: meetings?.value ?? 0, label: 'Görüşme isteyen kişi', detail: 'Takvim ya da yanıt bekliyorlar', href: '/yanitlar?intent=meeting', urgent: true },
    { key: 'wa-closing', count: closing.length, label: 'Yanıt penceresi kapanmak üzere', detail: 'WhatsApp serbest yanıt süresi 3 saatten az', href: '/whatsapp?filtre=bekleyen', urgent: true },
    { key: 'wa-waiting', count: waiting.length - closing.length, label: 'Yanıt bekleyen WhatsApp sohbeti', detail: null, href: '/whatsapp?filtre=bekleyen', urgent: false },
    { key: 'replies', count: replies?.value ?? 0, label: 'Okunmayı bekleyen yanıt', detail: 'E-posta, tek tık ve taslak sayfası notları', href: '/yanitlar', urgent: false },
    { key: 'unverified', count: inbox.counts.unverified, label: 'Doğrulanmamış WhatsApp numarası', detail: 'Yazanı teyit edip kişiye bağlayın', href: '/whatsapp?filtre=dogrulanmamis', urgent: false },
    { key: 'manual', count: manual?.value ?? 0, label: 'Elle gönderilecek WhatsApp mesajı', detail: 'Odak modunda tek tek gönderin', href: '/whatsapp?sekme=kuyruk', urgent: false },
    { key: 'review', count: pending?.value ?? 0, label: 'Onay bekleyen içerik', detail: null, href: '/kisiler?review=pending', urgent: false },
    { key: 'holds', count: holds?.value ?? 0, label: 'Hukuki incelemedeki kişi', detail: 'Bekletme kararı sizde', href: '/kisiler?review=hold', urgent: false },
  ]
  return tasks.filter((task) => task.count > 0)
}
