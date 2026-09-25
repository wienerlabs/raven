import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Settings2 } from 'lucide-react'
import { getDb } from '@/lib/db'
import { baseUrl } from '@/lib/env'
import { sampleSlug } from '@/lib/queries'
import { previewPayload, startLink } from '@/lib/channels/telegram'
import { resolveTelegram, telegramChecklist } from '@/lib/telegram/config'
import { telegramInbox } from '@/lib/telegram/inbox'
import { filterFromParam, type FilterKey } from '@/lib/whatsapp/format'
import { TelegramConversations } from './TelegramConversations'
import { TelegramSetup } from './TelegramSetup'

export const metadata: Metadata = { title: 'Telegram' }
export const maxDuration = 60

type Tab = 'sohbetler' | 'kurulum'

export default async function TelegramPage({ searchParams }: PageProps<'/telegram'>) {
  const params = await searchParams
  const tab: Tab = params.sekme === 'kurulum' ? 'kurulum' : 'sohbetler'
  const filter: FilterKey = filterFromParam(params.filtre) === 'waiting' ? 'waiting' : 'all'
  const selectedId = typeof params.kisi === 'string' && /^[0-9a-f-]{36}$/i.test(params.kisi) ? params.kisi : null
  const db = await getDb()
  const config = await resolveTelegram(db)
  const steps = telegramChecklist(config)
  const base = baseUrl()
  const [inbox, slug] = await Promise.all([telegramInbox(db, { filter: filter === 'waiting' ? 'waiting' : 'all' }), tab === 'kurulum' ? sampleSlug(db) : Promise.resolve(null)])
  const required = steps.filter((step) => step.key !== 'team')
  const tabs: Array<{ key: Tab; href: string; label: string; icon: typeof MessageCircle; badge: string | null; strong: boolean }> = [
    { key: 'sohbetler', href: '/telegram', label: 'Sohbetler', icon: MessageCircle, badge: inbox.counts.waiting ? String(inbox.counts.waiting) : null, strong: inbox.counts.waiting > 0 },
    { key: 'kurulum', href: '/telegram?sekme=kurulum', label: 'Kurulum', icon: Settings2, badge: `${required.filter((step) => step.done).length}/${required.length}`, strong: false },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-3xl tracking-tight text-ink">Telegram</h1>
        <nav className="flex w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 [scrollbar-width:none] sm:inline-flex sm:w-auto [&::-webkit-scrollbar]:hidden" aria-label="Telegram bölümleri">
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
          {config.username ? (
            <a href={`https://t.me/${encodeURIComponent(config.username)}`} target="_blank" rel="noreferrer noopener" className={config.ready ? 'rounded-full border border-accent bg-accent px-3 py-1 text-xs text-on-accent' : 'pill'}>
              @{config.username}
            </a>
          ) : (
            <span className="pill">Bot bağlı değil</span>
          )}
          {config.team ? <span className="pill hidden 2xl:inline-flex">Bildirimler: {config.team.title || 'sohbet'}</span> : null}
        </div>
      </div>
      {tab === 'kurulum' ? <p className="-mt-1 max-w-2xl text-sm text-mute">Üç adımda iki yönlü Telegram. Bot anahtarını kaydettiğinizde gerisi kendiliğinden kurulur.</p> : null}

      {tab === 'sohbetler' ? <TelegramConversations db={db} config={config} inbox={inbox} filter={filter} selectedId={selectedId} base={base} /> : null}
      {tab === 'kurulum' ? (
        <TelegramSetup
          username={config.username}
          botName={config.botName}
          hasToken={Boolean(config.token)}
          ready={config.ready}
          webhookUrl={`${base}/api/webhooks/telegram`}
          webhookSetAt={config.webhookSetAt}
          webhookError={config.webhookError}
          previewLink={config.ready && config.username && slug ? startLink(config.username, previewPayload(slug)) : null}
          team={config.team ? { title: config.team.title, linkedAt: config.team.linkedAt } : null}
          steps={steps}
        />
      ) : null}
    </div>
  )
}
