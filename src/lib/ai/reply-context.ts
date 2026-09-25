import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, pitches, responses } from '@/lib/db/schema'
import { baseUrl } from '@/lib/env'
import { getSettings } from '@/lib/settings'
import { whatsappThread } from '@/lib/whatsapp/inbox'
import { telegramThread } from '@/lib/telegram/inbox'
import { intentLabels } from '@/lib/labels'
import type { ReplyChannel, ReplyContext, ReplyTurn } from './reply'

export async function replyContextFor(db: Database, contactId: string, channel: ReplyChannel): Promise<ReplyContext | null> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return null
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1)
  if (!contact) return null
  const [pitchRow] = await db.select({ content: pitches.content }).from(pitches).where(eq(pitches.contactId, contactId)).limit(1)
  const pitch = pitchRow?.content ?? null
  const settings = await getSettings(db)
  const base = baseUrl()
  const conversation: ReplyTurn[] = []
  if (channel === 'whatsapp') {
    const thread = await whatsappThread(db, contactId, base)
    for (const message of thread?.messages ?? []) conversation.push({ direction: message.direction, text: message.text, at: message.at })
  } else if (channel === 'telegram') {
    const thread = await telegramThread(db, contactId)
    for (const message of thread?.messages ?? []) {
      if (message.kind !== 'start') conversation.push({ direction: message.direction, text: message.text, at: message.at })
    }
  } else {
    if (pitch) conversation.push({ direction: 'out', text: `${pitch.email.subject}. ${pitch.email.opening} ${pitch.email.body}`, at: contact.createdAt })
    const rows = await db
      .select({ kind: responses.kind, intent: responses.intent, body: responses.body, at: responses.createdAt })
      .from(responses)
      .where(and(eq(responses.contactId, contactId), inArray(responses.channel, ['email', 'landing']), inArray(responses.kind, ['reply', 'form', 'intent'])))
      .orderBy(asc(responses.createdAt))
    for (const row of rows) {
      const text = row.kind === 'intent' ? `(Tek tıkla yanıt: ${intentLabels[row.intent]})` : row.body ?? ''
      if (text.trim()) conversation.push({ direction: 'in', text, at: row.at })
    }
  }
  return {
    channel,
    language: pitch?.language ?? contact.language,
    sender: { fullName: settings.sender.fullName, firstName: settings.sender.firstName, title: settings.sender.title, company: settings.sender.company },
    contact: { greetingName: pitch?.person.greetingName ?? contact.firstName, fullName: `${contact.firstName} ${contact.lastName}`.trim(), company: pitch?.company.name ?? contact.company, title: contact.title },
    solution: pitch
      ? {
          name: pitch.solution.name,
          tagline: pitch.solution.tagline,
          problem: pitch.solution.problem,
          steps: pitch.solution.steps.map((step) => `${step.title}: ${step.detail}`),
          pilot: `${pitch.solution.pilot.duration}, ${pitch.solution.pilot.scope}. Teslim: ${pitch.solution.pilot.deliverable}`,
          kpis: pitch.solution.kpis,
        }
      : null,
    calendarUrl: settings.calendarUrl || null,
    briefUrl: `${base}/r/${contact.slug}`,
    conversation,
  }
}
