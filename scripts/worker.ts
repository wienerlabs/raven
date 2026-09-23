import './load-env'
import { getDb } from '@/lib/db'
import { dispatchDue } from '@/lib/campaign/dispatch'
import { activeSenders } from '@/lib/channels/email'
import { syncSenderInbox } from '@/lib/inbox/sync'
import { emailProvider } from '@/lib/env'

const DISPATCH_EVERY_MS = 30_000
const INBOX_EVERY_MS = 5 * 60_000

let stopping = false
process.on('SIGINT', () => {
  stopping = true
  console.log('stopping after the current cycle')
})
process.on('SIGTERM', () => {
  stopping = true
})

function stamp(): string {
  return new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
}

async function main() {
  const db = await getDb()
  console.log(`raven worker started, provider ${emailProvider()}, senders ${activeSenders().map((sender) => sender.email).join(', ')}`)
  let lastInbox = 0
  while (!stopping) {
    try {
      const report = await dispatchDue(db, { limit: 20 })
      if (report.claimed || report.errors.length) console.log(`${stamp()} dispatch ${JSON.stringify(report)}`)
      if (Date.now() - lastInbox > INBOX_EVERY_MS) {
        lastInbox = Date.now()
        for (const sender of activeSenders().filter((item) => item.imap)) {
          const result = await syncSenderInbox(db, sender)
          if (result.scanned || result.error) console.log(`${stamp()} inbox ${JSON.stringify(result)}`)
        }
      }
    } catch (error) {
      console.error(`${stamp()} cycle failed`, error)
    }
    for (let waited = 0; waited < DISPATCH_EVERY_MS && !stopping; waited += 1000) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
