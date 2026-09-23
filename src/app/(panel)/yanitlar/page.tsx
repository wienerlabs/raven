import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { listResponses } from '@/lib/queries'
import { formatDateTime, intentLabels } from '@/lib/labels'
import { waMeLink } from '@/lib/channels/whatsapp'
import { formatPhone } from '@/lib/contacts/phone'
import { IntentBadge, StageBadge } from '@/components/ui/Badges'
import { EmptyState } from '@/components/ui/Metric'
import { HandledButton } from './HandledButton'

export const metadata: Metadata = { title: 'Yanıtlar' }

const channelLabels = { email: 'E-posta yanıtı', whatsapp: 'WhatsApp', landing: 'Taslak sayfası' } as const
const kindLabels = { intent: 'Tek tık', form: 'Not', reply: 'Yanıt', auto_reply: 'Otomatik yanıt' } as const

export default async function ResponsesPage({ searchParams }: PageProps<'/yanitlar'>) {
  const params = await searchParams
  const show = typeof params.show === 'string' ? params.show : 'open'
  const intent = typeof params.intent === 'string' ? params.intent : undefined
  const db = await getDb()
  const rows = await listResponses(db, { show, intent })
  const tabs = [
    { key: 'open', label: 'Bekleyenler' },
    { key: 'all', label: 'Tümü' },
    { key: 'auto', label: 'Otomatik yanıtlar' },
  ]
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl tracking-tight text-ink">Yanıtlar</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">Tek tıkla verilen yanıtlar, taslak sayfasından bırakılan notlar, e-posta ve WhatsApp yanıtları tek yerde. Yanıt veren kişiye otomatik takip gönderilmez.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link key={tab.key} href={`/yanitlar?show=${tab.key}`} className={`chip ${show === tab.key ? 'chip-active' : ''}`}>
            {tab.label}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        {(Object.keys(intentLabels) as Array<keyof typeof intentLabels>).map((key) => (
          <Link key={key} href={`/yanitlar?show=${show}${intent === key ? '' : `&intent=${key}`}`} className={`chip ${intent === key ? 'chip-active' : ''}`}>
            {intentLabels[key]}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Burada henüz bir şey yok" body="Bir alıcı e-postadaki yanıt butonlarından birine bastığında, taslak sayfasına not bıraktığında veya e-postayı yanıtladığında burada görürsünüz." />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ response, contact, solution, greeting }) => {
            const replySubject = encodeURIComponent(`${solution ?? 'Wiener Labs'} hakkında`)
            const mailto = contact.email ? `mailto:${contact.email}?subject=${replySubject}` : null
            const whatsapp = contact.phone ? waMeLink(contact.phone, `Merhaba ${greeting ?? contact.firstName}, `) : null
            return (
              <li key={response.id} className={`card ${response.handled ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <IntentBadge intent={response.intent} />
                      <span className="pill">{kindLabels[response.kind]}</span>
                      <span className="text-xs text-mute">{channelLabels[response.channel]}</span>
                    </div>
                    <Link href={`/kisiler/${contact.id}`} className="mt-2 block text-lg tracking-tight text-ink">
                      {contact.firstName} {contact.lastName}
                    </Link>
                    <div className="text-sm text-mute">
                      {contact.title ?? ''} {contact.title ? '·' : ''} {contact.company}
                    </div>
                    {solution ? <div className="mt-1 text-xs text-mute">Önerilen: {solution}</div> : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-mute">{formatDateTime(response.createdAt)}</span>
                    <StageBadge stage={contact.stage} />
                  </div>
                </div>
                {response.body ? <p className="mt-4 whitespace-pre-line rounded-2xl bg-soft p-4 text-sm text-ink">{response.body}</p> : null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {mailto ? (
                    <a href={mailto} className="btn btn-sm">
                      E-posta ile yanıtla
                    </a>
                  ) : null}
                  {whatsapp ? (
                    <a href={whatsapp} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                      WhatsApp ({formatPhone(contact.phone)})
                    </a>
                  ) : null}
                  <HandledButton id={response.id} handled={response.handled} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
