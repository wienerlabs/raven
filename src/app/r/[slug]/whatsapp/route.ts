import { getDb } from '@/lib/db'
import { baseUrl } from '@/lib/env'
import { contactBySlug } from '@/lib/public'
import { findMessageByToken, recordEvent } from '@/lib/campaign/state'
import { clickToChatText, waMeLink } from '@/lib/channels/whatsapp'
import { resolveWhatsapp } from '@/lib/whatsapp/config'
import { isAutomatedAgent } from '@/lib/security/agents'

export async function GET(request: Request, { params }: RouteContext<'/r/[slug]/whatsapp'>) {
  const { slug } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get('m')
  const db = await getDb()
  const [found, config] = await Promise.all([contactBySlug(db, slug), resolveWhatsapp(db)])
  const landing = new URL(`/r/${encodeURIComponent(slug)}`, baseUrl())
  if (token && /^[A-Za-z0-9_-]{16,64}$/.test(token)) landing.searchParams.set('m', token)
  if (!found || !config.businessNumber) return Response.redirect(landing, 302)
  const { contact, pitch } = found
  const message = token ? await findMessageByToken(db, token) : null
  if (!message?.isTest && !isAutomatedAgent(request.headers.get('user-agent'))) {
    await recordEvent(db, { contactId: contact.id, messageId: message && message.contactId === contact.id ? message.id : null, type: 'wa_click', data: { source: url.searchParams.get('s') === 'email' ? 'email' : 'page' } })
  }
  const text = clickToChatText({ language: pitch.language, company: pitch.company.name, solution: pitch.solution.name, slug: contact.slug })
  return Response.redirect(waMeLink(config.businessNumber, text), 302)
}
