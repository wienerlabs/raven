import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '@/lib/db'
import { contacts, messages } from '@/lib/db/schema'
import type { SenderConfig } from '@/lib/env'
import { findContactByAddress, recordEvent, recordResponse, suppress } from '@/lib/campaign/state'
import { getSettings, getState, setState } from '@/lib/settings'
import { notifyTeam } from '@/lib/notify'
import { classifyInbound, classifyReplyIntent, extractFailedRecipients, extractMessageIds, stripQuoted, wantsUnsubscribe, type InboundMail } from './classify'

export interface InboxSyncResult {
  sender: string
  scanned: number
  replies: number
  autoReplies: number
  bounces: number
  unsubscribes: number
  error: string | null
}

interface CursorState {
  uidValidity: string
  lastUid: number
}

function headerValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((item) => headerValue(item) ?? '').join(' ')
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const record = value as { value: unknown; params?: Record<string, string> }
    const params = record.params ? Object.entries(record.params).map(([key, param]) => `${key}=${param}`).join('; ') : ''
    return `${String(record.value)}${params ? `; ${params}` : ''}`
  }
  return String(value)
}

export async function handleInbound(db: Database, mail: InboundMail, at = new Date()): Promise<'bounce' | 'auto_reply' | 'reply' | 'unsubscribe' | 'ignored'> {
  const kind = classifyInbound(mail)
  if (kind === 'bounce') {
    const ids = extractMessageIds(mail.raw)
    const matched = ids.length ? await db.select().from(messages).where(inArray(messages.rfcMessageId, ids)) : []
    const targets = new Map<string, string | null>()
    for (const message of matched) if (!message.isTest) targets.set(message.contactId, message.id)
    if (targets.size === 0) {
      for (const address of extractFailedRecipients(mail.raw)) {
        const contact = await findContactByAddress(db, address)
        if (contact) targets.set(contact.id, null)
      }
    }
    if (targets.size === 0) return 'ignored'
    for (const [contactId, messageId] of targets) {
      const rows = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, contactId)).limit(1)
      await recordEvent(db, { contactId, messageId, type: 'bounce', data: { subject: mail.subject.slice(0, 200) }, at })
      if (rows[0]?.email) await suppress(db, { contactId, value: rows[0].email, kind: 'email', reason: 'bounce' })
    }
    return 'bounce'
  }
  const ids = extractMessageIds(`${mail.inReplyTo ?? ''} ${mail.references.join(' ')}`)
  const matched = ids.length ? await db.select().from(messages).where(and(inArray(messages.rfcMessageId, ids), eq(messages.isTest, false))) : []
  const fromAddress = (/<([^>]+)>/.exec(mail.from)?.[1] ?? mail.from).trim().toLowerCase()
  const message = matched[0] ?? null
  const contact = message
    ? ((await db.select().from(contacts).where(eq(contacts.id, message.contactId)).limit(1))[0] ?? null)
    : await findContactByAddress(db, fromAddress)
  if (!contact) return 'ignored'
  if (!message && (contact.stage === 'new' || contact.stage === 'queued')) return 'ignored'
  const body = stripQuoted(mail.text).slice(0, 4000)
  if (kind === 'auto_reply') {
    await recordResponse(db, { contactId: contact.id, messageId: message?.id, channel: 'email', kind: 'auto_reply', intent: 'other', body, fromAddress, at })
    return 'auto_reply'
  }
  if (wantsUnsubscribe(body)) {
    await recordResponse(db, { contactId: contact.id, messageId: message?.id, channel: 'email', kind: 'reply', intent: 'not_interested', body, fromAddress, at })
    if (contact.email) await suppress(db, { contactId: contact.id, value: contact.email, kind: 'email', reason: 'unsubscribe' })
    await recordEvent(db, { contactId: contact.id, messageId: message?.id, type: 'unsubscribe', data: { via: 'reply' }, at })
    return 'unsubscribe'
  }
  const intent = classifyReplyIntent(body)
  await recordResponse(db, { contactId: contact.id, messageId: message?.id, channel: 'email', kind: 'reply', intent, body, fromAddress, at })
  const settings = await getSettings(db)
  await notifyTeam(settings, `${contact.firstName} ${contact.lastName} yanıt verdi`, [`${contact.company}`, `Niyet: ${intent}`, '', body.slice(0, 800)])
  return 'reply'
}

export async function syncSenderInbox(db: Database, sender: SenderConfig, options: { now?: Date; lookbackDays?: number; maxMessages?: number } = {}): Promise<InboxSyncResult> {
  const result: InboxSyncResult = { sender: sender.id, scanned: 0, replies: 0, autoReplies: 0, bounces: 0, unsubscribes: 0, error: null }
  if (!sender.imap) return { ...result, error: 'IMAP is not configured for this sender' }
  const now = options.now ?? new Date()
  const { ImapFlow } = await import('imapflow')
  const { simpleParser } = await import('mailparser')
  const client = new ImapFlow({
    host: sender.imap.host,
    port: sender.imap.port,
    secure: sender.imap.secure,
    auth: { user: sender.imap.user, pass: sender.imap.pass },
    logger: false,
  })
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const mailbox = client.mailbox
      if (!mailbox) throw new Error('INBOX could not be opened')
      const uidValidity = String(mailbox.uidValidity)
      const key = `imap:${sender.id}`
      const state = await getState<CursorState>(db, key)
      const since = new Date(now.getTime() - (options.lookbackDays ?? 10) * 24 * 3600 * 1000)
      const found = state && state.uidValidity === uidValidity ? await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true }) : await client.search({ since }, { uid: true })
      const uids = (Array.isArray(found) ? found : []).filter((uid) => !state || state.uidValidity !== uidValidity || uid > state.lastUid).sort((a, b) => a - b)
      const batch = uids.slice(-(options.maxMessages ?? 150))
      let lastUid = state && state.uidValidity === uidValidity ? state.lastUid : 0
      for (const uid of batch) {
        const fetched = await client.fetchOne(String(uid), { uid: true, source: { maxLength: 400_000 } }, { uid: true })
        lastUid = Math.max(lastUid, uid)
        if (!fetched || !fetched.source) continue
        result.scanned += 1
        const parsed = await simpleParser(fetched.source)
        const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
        const outcome = await handleInbound(
          db,
          {
            from: parsed.from?.text ?? '',
            subject: parsed.subject ?? '',
            text: parsed.text ?? '',
            inReplyTo: parsed.inReplyTo ?? null,
            references,
            autoSubmitted: headerValue(parsed.headers.get('auto-submitted')),
            autoReplyHeader: parsed.headers.has('x-autoreply') || parsed.headers.has('x-autorespond') || headerValue(parsed.headers.get('precedence'))?.toLowerCase() === 'auto_reply',
            contentType: headerValue(parsed.headers.get('content-type')) ?? '',
            raw: fetched.source.toString('utf8'),
          },
          parsed.date ?? now,
        )
        if (outcome === 'reply') result.replies += 1
        if (outcome === 'auto_reply') result.autoReplies += 1
        if (outcome === 'bounce') result.bounces += 1
        if (outcome === 'unsubscribe') result.unsubscribes += 1
      }
      await setState<CursorState>(db, key, { uidValidity, lastUid })
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    closeQuietly(client)
  }
  return result
}

function closeQuietly(client: { close(): void }): unknown {
  try {
    client.close()
    return null
  } catch (error) {
    return error
  }
}
