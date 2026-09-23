import { getDb } from '@/lib/db'
import { dispatchDue } from '@/lib/campaign/dispatch'
import { activeSenders } from '@/lib/channels/email'
import { syncSenderInbox } from '@/lib/inbox/sync'
import { authorizedCron } from '@/lib/security/cron'

export const maxDuration = 60

export async function GET(request: Request) {
  if (!authorizedCron(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const db = await getDb()
  const started = Date.now()
  const report = await dispatchDue(db, { limit: 20 })
  const url = new URL(request.url)
  const minute = new Date().getUTCMinutes()
  const inbox = url.searchParams.get('inbox') === '1' || minute % 5 === 0
  const inboxResults = []
  if (inbox) {
    for (const sender of activeSenders().filter((item) => item.imap)) {
      if (Date.now() - started > 40_000) break
      inboxResults.push(await syncSenderInbox(db, sender, { maxMessages: 60 }))
    }
  }
  return Response.json({ ok: true, dispatch: report, inbox: inboxResults, ms: Date.now() - started })
}
