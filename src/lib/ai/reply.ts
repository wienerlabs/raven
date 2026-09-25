import type Anthropic from '@anthropic-ai/sdk'
import { replyModel } from '@/lib/env'
import { anthropic } from './client'

export const AI_BUSY = 'Bir saatte üretilebilecek AI taslak sınırına ulaşıldı. Biraz sonra yeniden deneyin.'

export type ReplyChannel = 'whatsapp' | 'email'

export interface ReplyTurn {
  direction: 'in' | 'out'
  text: string
  at: Date
}

export interface ReplyContext {
  channel: ReplyChannel
  language: 'tr' | 'en'
  sender: { fullName: string; firstName: string; title: string; company: string }
  contact: { greetingName: string; fullName: string; company: string; title: string | null }
  solution: { name: string; tagline: string; problem: string; steps: string[]; pilot: string; kpis: string[] } | null
  calendarUrl: string | null
  briefUrl: string | null
  conversation: ReplyTurn[]
}

type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>

const lengthLimits: Record<ReplyChannel, number> = { whatsapp: 700, email: 1800 }
const dashes = new RegExp(`[${String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015, 0x2212)}]`, 'g')
const dashWithSpace = new RegExp(`\\s*[${String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015, 0x2212)}]\\s*`, 'g')
const quotes = String.fromCharCode(0x201c, 0x201d, 0x2018, 0x2019)
const edgeQuotes = new RegExp(`^["'${quotes}]+|["'${quotes}]+$`, 'g')
const pictographs = new RegExp(`[\\p{Extended_Pictographic}${String.fromCharCode(0xfe0f, 0x200d)}]`, 'gu')

export function cleanDraft(text: string, channel: ReplyChannel): string {
  let out = text.replace(/\r\n/g, '\n').trim()
  out = out.replace(/^(taslak|draft|yanıt|reply)\s*:\s*/i, '')
  out = out.replace(edgeQuotes, '').trim()
  out = out.replace(dashWithSpace, ', ').replace(dashes, ', ')
  out = out.replace(pictographs, '').replace(/!/g, '.')
  out = out.replace(/\.{2,}/g, '.').replace(/,\s*,/g, ',').replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
  out = out
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
  const limit = lengthLimits[channel]
  if (out.length > limit) {
    const cut = out.slice(0, limit)
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('.\n'))
    out = (end > limit * 0.5 ? cut.slice(0, end + 1) : cut).trim()
  }
  return out
}

export function buildReplyPrompt(context: ReplyContext): { system: string; user: string } {
  const language = context.language === 'en' ? 'English' : 'Turkish'
  const channelRules =
    context.channel === 'whatsapp'
      ? 'Channel: WhatsApp. One to three short sentences in a single paragraph. Start with the contact\'s name only when it reads naturally. No signature.'
      : 'Channel: email reply. Two to five short sentences. First line is a greeting with the contact\'s name, last line is the sender\'s first name.'
  const system = [
    `You write the next reply from ${context.sender.fullName} (${context.sender.title}, ${context.sender.company}) to a business contact who answered a personal outreach message about an AI solution designed for their company.`,
    `Write in ${language}. ${channelRules}`,
    'Answer what the contact actually said, using only facts from the context. Never invent prices, dates, clients, integrations, results or promises.',
    'If they want to meet, propose a short call and include the calendar link when one is given; otherwise ask for two times that suit them.',
    'If they want details, point to the personal brief link when one is given and offer a short call.',
    'If they decline or say later, thank them briefly and leave the door open without pushing.',
    'If the contact asks something the context cannot answer, say you will check and come back, do not guess.',
    context.language === 'en' ? 'Keep a warm, direct, professional tone.' : 'Use the formal "siz" form and natural business Turkish, not translated English.',
    'Never use em dashes or en dashes, exclamation marks, emoji, markdown, bullet lists or placeholders in square brackets.',
    'Output only the message text.',
  ].join('\n')
  const facts: string[] = [
    `Contact: ${context.contact.fullName}${context.contact.title ? `, ${context.contact.title}` : ''}, ${context.contact.company}. Address them as ${context.contact.greetingName}.`,
  ]
  if (context.solution) {
    facts.push(`Proposed solution: ${context.solution.name}. ${context.solution.tagline}`)
    facts.push(`Problem it addresses: ${context.solution.problem}`)
    facts.push(`How it works: ${context.solution.steps.join(' / ')}`)
    facts.push(`Pilot: ${context.solution.pilot}`)
    facts.push(`Success metrics: ${context.solution.kpis.join('; ')}`)
  }
  if (context.briefUrl) facts.push(`Personal brief link: ${context.briefUrl}`)
  if (context.calendarUrl) facts.push(`Calendar link: ${context.calendarUrl}`)
  const transcript = context.conversation
    .slice(-12)
    .map((turn) => `${turn.direction === 'in' ? context.contact.greetingName : context.sender.firstName}: ${turn.text.replace(/\s+/g, ' ').trim().slice(0, 1200)}`)
    .join('\n')
  const user = ['Context:', ...facts.map((fact) => `- ${fact}`), '', 'Conversation so far, oldest first:', transcript || '(no messages yet)', '', `Write the next message from ${context.sender.firstName}.`].join('\n')
  return { system, user }
}

export async function draftReply(context: ReplyContext, options: { model?: string; create?: CreateMessage } = {}): Promise<{ text: string; model: string }> {
  const model = options.model ?? replyModel()
  const create: CreateMessage = options.create ?? (async (params) => (await anthropic()).messages.create(params))
  const prompt = buildReplyPrompt(context)
  const response = await create({ model, max_tokens: 700, system: prompt.system, messages: [{ role: 'user', content: prompt.user }] })
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  const cleaned = cleanDraft(text, context.channel)
  if (!cleaned) throw new Error('empty draft')
  return { text: cleaned, model }
}
