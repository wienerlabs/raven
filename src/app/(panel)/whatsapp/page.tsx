import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Send, Settings2 } from 'lucide-react'
import { getDb, type Database } from '@/lib/db'
import { phoneContactsWithoutWhatsapp, whatsappQueue } from '@/lib/queries'
import { baseUrl } from '@/lib/env'
import { renderWhatsapp } from '@/lib/email/render'
import { buildLinks } from '@/lib/email/links'
import { templateDefinitions, waMeLink } from '@/lib/channels/whatsapp'
import { ensureVerifyToken, resolveFrom, setupChecklist, type ResolvedWhatsapp } from '@/lib/whatsapp/config'
import { whatsappInbox } from '@/lib/whatsapp/inbox'
import { filterFromParam } from '@/lib/whatsapp/format'
import { formatDateTime } from '@/lib/labels'
import { formatPhone } from '@/lib/contacts/phone'
import { MessageBadge } from '@/components/ui/Badges'
import { EmptyState } from '@/components/ui/Metric'
import { Conversations } from './Conversations'
import { QueueFocus } from './QueueFocus'
import { AddToQueue } from './QueueActions'
import { WhatsappSetup } from './WhatsappSetup'

export const metadata: Metadata = { title: 'WhatsApp' }
export const maxDuration = 60

type Tab = 'sohbetler' | 'kuyruk' | 'kurulum'

async function QueueTab({ db, config, base, queue }: { db: Database; config: ResolvedWhatsapp; base: string; queue: Awaited<ReturnType<typeof whatsappQueue>> }) {
  const candidates = await phoneContactsWithoutWhatsapp(db)
  const manual = queue.filter((row) => row.message.status === 'manual')
  const done = queue.filter((row) => row.message.status !== 'manual')
  const items = manual.map(({ message, contact, pitch }) => {
    const text = renderWhatsapp(pitch, buildLinks(base, contact.slug, message.token).whatsappLanding)
    return {
      id: message.id,
      contactId: contact.id,
      name: `${pitch.person.firstName} ${pitch.person.lastName}`.trim(),
      company: contact.company,
      phone: formatPhone(contact.phone),
      link: contact.phone ? waMeLink(contact.phone, text) : null,
      text,
    }
  })
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-mute">
        {config.mode === 'cloud'
          ? 'Otomatik gönderim açık. Meta kuralı gereği otomatik mesaj yalnızca WhatsApp izni olan kişilere gider; diğerleri burada sırayla gönderilmeyi bekler.'
          : "Odak modunda kuyruk tek tek önünüze gelir: WhatsApp'ta açın, gönderin, Gönderildi deyin. Klavyede O, G ve S yeterli."}
      </p>
      {items.length ? (
        <QueueFocus items={items} />
      ) : (
        <EmptyState
          title="Elle gönderilecek mesaj yok"
          body={candidates.length ? 'Telefonu olan onaylı kişileri aşağıdan kuyruğa ekleyebilirsiniz.' : 'Kampanya başladığında e-postası olmayan ama telefonu olan kişiler burada listelenir. Kişiler sayfasından numara da ekleyebilirsiniz.'}
        />
      )}
      {candidates.length ? (
        <section className="card">
          <h2 className="text-lg text-ink">Telefonu olan onaylı kişiler</h2>
          <p className="mt-1 text-sm text-mute">E-postası olsa bile WhatsApp ile de yazmak istediğiniz kişileri kuyruğa ekleyin.</p>
          <AddToQueue contacts={candidates.map(({ contact, pitch }) => ({ id: contact.id, name: `${pitch.person.firstName} ${pitch.person.lastName}`, company: contact.company, phone: formatPhone(contact.phone) }))} />
        </section>
      ) : null}
      {done.length ? (
        <details className="card">
          <summary className="cursor-pointer text-lg text-ink">
            Gönderilenler <span className="text-sm text-mute">({done.length})</span>
          </summary>
          <ul className="mt-3 divide-y divide-line text-sm">
            {done.map(({ message, contact }) => (
              <li key={message.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/kisiler/${contact.id}`} className="text-ink">
                  {contact.firstName} {contact.lastName} <span className="text-mute">· {contact.company}</span>
                </Link>
                <span className="flex items-center gap-2 text-xs text-mute">
                  <MessageBadge status={message.status} />
                  {formatDateTime(message.sentAt ?? message.scheduledAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export default async function WhatsappPage({ searchParams }: PageProps<'/whatsapp'>) {
  const params = await searchParams
  const tab: Tab = params.sekme === 'kuyruk' || params.sekme === 'kurulum' ? params.sekme : 'sohbetler'
  const filter = filterFromParam(params.filtre)
  const selectedId = typeof params.kisi === 'string' && /^[0-9a-f-]{36}$/i.test(params.kisi) ? params.kisi : null
  const db = await getDb()
  const stored = await ensureVerifyToken(db)
  const config = resolveFrom(stored)
  const steps = setupChecklist(config)
  const base = baseUrl()
  const [inbox, queue] = await Promise.all([whatsappInbox(db, { filter }), whatsappQueue(db)])
  const manualCount = queue.filter((row) => row.message.status === 'manual').length
  const required = steps.filter((step) => step.key !== 'auto')
  const tabs: Array<{ key: Tab; href: string; label: string; icon: typeof MessageCircle; badge: string | null; strong: boolean }> = [
    { key: 'sohbetler', href: '/whatsapp', label: 'Sohbetler', icon: MessageCircle, badge: inbox.counts.waiting ? String(inbox.counts.waiting) : null, strong: inbox.counts.waiting > 0 },
    { key: 'kuyruk', href: '/whatsapp?sekme=kuyruk', label: 'Kuyruk', icon: Send, badge: manualCount ? String(manualCount) : null, strong: false },
    { key: 'kurulum', href: '/whatsapp?sekme=kurulum', label: 'Kurulum', icon: Settings2, badge: `${required.filter((step) => step.done).length}/${required.length}`, strong: false },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-3xl tracking-tight text-ink">WhatsApp</h1>
        <nav className="flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 [scrollbar-width:none] sm:inline-flex sm:w-auto [&::-webkit-scrollbar]:hidden" aria-label="WhatsApp bölümleri">
          {tabs.map((item) => {
            const Icon = item.icon
            const active = item.key === tab
            return (
              <Link key={item.key} href={item.href} aria-current={active ? 'page' : undefined} className={'inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] transition sm:flex-none sm:gap-2 sm:px-3.5 sm:text-sm ' + (active ? 'bg-accent text-on-accent' : 'text-mute hover:bg-soft hover:text-ink')}>
                <Icon className="hidden h-4 w-4 sm:block" />
                {item.label}
                {item.badge ? <span className={'rounded-full px-1.5 text-[11px] ' + (active ? 'bg-surface/70 text-ink' : item.strong ? 'bg-accent text-on-accent' : 'bg-soft text-mute')}>{item.badge}</span> : null}
              </Link>
            )
          })}
        </nav>
        <div className="hidden flex-wrap items-center gap-2 xl:ml-auto xl:flex">
          <span className={config.mode === 'cloud' ? 'rounded-full border border-accent bg-accent px-3 py-1 text-xs text-on-accent' : 'pill'}>{config.mode === 'cloud' ? 'Otomatik gönderim açık' : config.cloud ? 'Cloud API bağlı' : 'Elle gönderim'}</span>
          {config.businessNumber ? <span className="pill hidden 2xl:inline-flex">{formatPhone(config.businessNumber)}</span> : null}
        </div>
      </div>
      {tab === 'kurulum' ? <p className="-mt-1 max-w-2xl text-sm text-mute">Beş adımda iki yönlü WhatsApp. Yalnızca iş numarasıyla da başlayabilirsiniz.</p> : null}

      {tab === 'sohbetler' ? <Conversations db={db} config={config} inbox={inbox} filter={filter} selectedId={selectedId} base={base} /> : null}
      {tab === 'kuyruk' ? <QueueTab db={db} config={config} base={base} queue={queue} /> : null}
      {tab === 'kurulum' ? (
        <WhatsappSetup
          businessNumberLabel={config.businessNumber ? formatPhone(config.businessNumber) : null}
          initial={{ businessNumber: config.businessNumber ?? '', autoSend: config.autoSend, phoneNumberId: stored.phoneNumberId, wabaId: stored.wabaId, templateName: stored.templateName }}
          hasToken={config.hasToken}
          hasAppSecret={config.hasAppSecret}
          cloudReady={Boolean(config.cloud)}
          mode={config.mode}
          webhookUrl={`${base}/api/webhooks/whatsapp`}
          verifyToken={config.verifyToken}
          webhookVerifiedAt={config.webhookVerifiedAt}
          templates={stored.templates}
          templatesCheckedAt={stored.templatesCheckedAt}
          templateTexts={templateDefinitions(base)}
          steps={steps}
        />
      ) : null}
    </div>
  )
}
