import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { getDb } from '@/lib/db'
import { ensureCampaign, nextScheduled } from '@/lib/campaign/launch'
import { latestCampaign, overviewStats, readyToLaunch, recentResponses } from '@/lib/queries'
import { readiness } from '@/lib/readiness'
import { getSettings } from '@/lib/settings'
import { formatDateTime, percent, stageLabels } from '@/lib/labels'
import { IntentBadge } from '@/components/ui/Badges'
import { EmptyState, Metric, Row } from '@/components/ui/Metric'
import type { Stage } from '@/lib/db/schema'

export const metadata: Metadata = { title: 'Panel' }

const funnel: Stage[] = ['new', 'queued', 'contacted', 'engaged', 'replied', 'meeting', 'declined', 'unsubscribed', 'bounced']
const campaignStatusLabels = { draft: 'Başlatılmadı', running: 'Gönderiyor', paused: 'Durduruldu', completed: 'Tamamlandı' } as const

export default async function OverviewPage() {
  const db = await getDb()
  const [stats, settings, responses, ready] = await Promise.all([overviewStats(db), getSettings(db), recentResponses(db), readyToLaunch(db)])
  const campaign = (await latestCampaign(db)) ?? (await ensureCampaign(db))
  const next = await nextScheduled(db, campaign.id)
  const checklist = await readiness(db, settings, { total: stats.total, withPitch: stats.withPitch, approved: stats.review.approved ?? 0 })
  const contacted = stats.sentInitial
  const maxStage = Math.max(1, ...funnel.map((stage) => stats.stage[stage] ?? 0))

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col justify-center">
          <span className="pill w-fit">Wiener Labs · Raven</span>
          <h1 className="mt-5 text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl">
            {stats.total > 0 ? `${stats.total} kişi, ${stats.total} ayrı çözüm.` : 'Listenizi yükleyin, her kişiye kendi çözümünü hazırlayalım.'}
          </h1>
          <p className="mt-4 max-w-xl text-base text-mute">
            Her alıcı, kendi şirketine ve rolüne göre tasarlanmış bir yapay zekâ çözümü, kişisel bir taslak sayfası ve tek tıkla yanıt verebileceği bir e-posta alır. Gönderimler mesai saatlerinde kademeli ilerler, yanıt verenlere takip gitmez.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/kampanya" className="btn">
              {campaign.status === 'running' ? 'Kampanyayı izle' : `Kampanyaya geç${ready ? ` (${ready} hazır)` : ''}`}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/kisiler" className="btn-ghost">
              Kişileri incele
            </Link>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-ink">
              {campaign.status === 'running' ? <span className="live-dot" /> : null}
              {campaign.name}
            </div>
            <span className={campaign.status === 'running' ? 'rounded-full border border-accent bg-accent px-2.5 py-0.5 text-xs text-on-accent' : 'pill'}>{campaignStatusLabels[campaign.status]}</span>
          </div>
          <div className="mt-4 space-y-2">
            <Row label="İlk e-posta gönderilen" value={contacted} />
            <Row label="Takip e-postası" value={stats.sentFollowUps} />
            <Row label="Sıradaki gönderim" value={next ? formatDateTime(next) : 'Yok'} />
            <Row label="Gönderime hazır" value={ready} />
          </div>
          {campaign.pauseReason && campaign.status === 'paused' ? <p className="mt-3 text-xs text-mute">{campaign.pauseReason}</p> : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Kişiler" value={stats.total} hint={`${stats.withPitch} içerik hazır`} />
        <Metric label="Onaylı" value={stats.review.approved ?? 0} hint={`${stats.review.pending ?? 0} incelemede`} />
        <Metric label="Gönderildi" value={contacted} hint={`${stats.review.hold ?? 0} beklemede`} />
        <Metric label="Taslağı açan" value={stats.viewers} hint={`${percent(stats.viewers, contacted)} açılma`} />
        <Metric label="Yanıt veren" value={stats.responders} hint={`${percent(stats.responders, contacted)} yanıt`} emphasis={stats.responders > 0} />
        <Metric label="Görüşme isteyen" value={stats.meetings} hint="Takvim veya not ile" emphasis={stats.meetings > 0} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card">
          <h2 className="text-lg text-ink">Dönüşüm hunisi</h2>
          <p className="mt-1 text-sm text-mute">Her kişinin şu anki aşaması.</p>
          <div className="mt-5 space-y-2.5">
            {funnel.map((stage) => {
              const value = stats.stage[stage] ?? 0
              const positive = stage === 'engaged' || stage === 'replied' || stage === 'meeting'
              return (
                <Link key={stage} href={`/kisiler?stage=${stage}`} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                  <span className="text-mute">{stageLabels[stage]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-soft">
                    <span className={`block h-full rounded-full ${positive ? 'bg-accent-strong' : 'bg-line'}`} style={{ width: `${Math.max(value ? 3 : 0, (value / maxStage) * 100)}%` }} />
                  </span>
                  <span className="text-right text-ink">{value}</span>
                </Link>
              )
            })}
          </div>
          {stats.variants.length > 1 ? (
            <div className="mt-6 border-t border-line pt-4">
              <div className="text-xs text-mute">Konu satırı testi</div>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {stats.variants.map((variant) => (
                  <div key={variant.variant} className="rounded-2xl border border-line p-3 text-sm">
                    <div className="text-mute">{variant.variant === 'a' ? 'Konu A' : 'Konu B'}</div>
                    <div className="mt-1 text-ink">
                      {variant.replied} yanıt / {variant.sent} gönderim <span className="text-mute">({percent(variant.replied, variant.sent)})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="card">
          <h2 className="text-lg text-ink">Gönderime hazırlık</h2>
          <p className="mt-1 text-sm text-mute">Hepsi tamamlanınca kampanya güvenle başlar.</p>
          <ol className="mt-4 space-y-3">
            {checklist.map((item, index) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-start gap-3 rounded-2xl p-1 text-sm transition hover:bg-soft">
                  <span className={'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ' + (item.done ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-mute')}>
                    {item.done ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span>
                    <span className="block text-ink">{item.label}</span>
                    <span className="block text-xs text-mute">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg text-ink">Son yanıtlar</h2>
          <Link href="/yanitlar" className="chip">
            Tümü <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {responses.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Henüz yanıt yok" body="Tek tıkla yanıtlar, taslak sayfasından bırakılan notlar ve e-posta yanıtları burada görünür." />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {responses.map(({ response, contact }) => (
              <li key={response.id}>
                <Link href={`/kisiler/${contact.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="text-ink">
                      {contact.firstName} {contact.lastName}
                    </span>
                    <span className="ml-2 text-mute">{contact.company}</span>
                    {response.body ? <span className="mt-0.5 block truncate text-xs text-mute">{response.body}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <IntentBadge intent={response.intent} />
                    <span className="text-xs text-mute">{formatDateTime(response.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
