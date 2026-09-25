import { getDb } from '@/lib/db'
import { baseUrl } from '@/lib/env'
import { contactBySlug } from '@/lib/public'
import { findMessageByToken, recordEvent } from '@/lib/campaign/state'
import { contactPayload, previewPayload, startLink } from '@/lib/channels/telegram'
import { resolveTelegram } from '@/lib/telegram/config'
import { isAutomatedAgent } from '@/lib/security/agents'

export async function GET(request: Request, { params }: RouteContext<'/r/[slug]/telegram'>) {
  const { slug } = await params
  const url = new URL(request.url)
  const token = url.searchParams.get('m')
  const db = await getDb()
  const [found, config] = await Promise.all([contactBySlug(db, slug), resolveTelegram(db)])
  const landing = new URL(`/r/${encodeURIComponent(slug)}`, baseUrl())
  if (token && /^[A-Za-z0-9_-]{16,64}$/.test(token)) landing.searchParams.set('m', token)
  if (!found || !config.ready || !config.username) return Response.redirect(landing, 302)
  const { contact } = found
  const message = token ? await findMessageByToken(db, token) : null
  if (message?.isTest) return Response.redirect(startLink(config.username, previewPayload(contact.slug)), 302)
  if (!isAutomatedAgent(request.headers.get('user-agent'))) {
    await recordEvent(db, { contactId: contact.id, messageId: message && message.contactId === contact.id ? message.id : null, type: 'tg_click', data: { source: url.searchParams.get('s') === 'email' ? 'email' : 'page' } })
  }
  return Response.redirect(startLink(config.username, contactPayload(contact.slug)), 302)
}
