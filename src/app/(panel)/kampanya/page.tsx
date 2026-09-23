import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { ensureCampaign, nextScheduled } from '@/lib/campaign/launch'
import { campaignOverview, readyToLaunch } from '@/lib/queries'
import { environmentSummary } from '@/lib/readiness'
import { emailProviderLabel } from '@/lib/channels/email'
import { formatDateTime, messageStatusLabels, stepLabels } from '@/lib/labels'
import { MessageBadge } from '@/components/ui/Badges'
import { Metric } from '@/components/ui/Metric'
import type { MessageStatus } from '@/lib/db/schema'
import { saveConfig } from '@/app/actions/campaign'
import { CampaignControls } from './CampaignControls'
import { ConfigForm } from './ConfigForm'

export const metadata: Metadata = { title: 'Kampanya' }

const statusOrder: MessageStatus[] = ['scheduled', 'sending', 'sent', 'failed', 'cancelled', 'manual']

export default async function CampaignPage() {
  const db = await getDb()
  const campaign = await ensureCampaign(db)
  const [overview, ready, next] = await Promise.all([campaignOverview(db, campaign.id), readyToLaunch(db), nextScheduled(db, campaign.id)])
  const env = environmentSummary()
  const cell = (step: number, channel: 'email' | 'whatsapp', status: MessageStatus) =>
    overview.statusRows.filter((row) => row.step === step && row.channel === channel && row.status === status).reduce((sum, row) => sum + row.value, 0)
  const initialTotal = statusOrder.reduce((sum, status) => sum + cell(0, 'email', status), 0)
  const initialSent = cell(0, 'email', 'sent')
  const progress = initialTotal ? Math.round((initialSent / initialTotal) * 100) : 0
  const senderCount = Math.max(1, env.senders.length)
  const perDay = senderCount * Math.min(campaign.config.dailyLimitPerSender, ...env.senders.map((sender) => sender.dailyLimit).concat([campaign.config.dailyLimitPerSender]))
  const estimateDays = ready ? Math.ceil(ready / perDay) : 0

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight text-ink">Kampanya</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Tek tuşla herkes sıraya girer; Raven gönderimleri mesai saatlerine ({campaign.config.windowStartHour}:00 ile {campaign.config.windowEndHour}:00 arası, {campaign.config.weekdays.length === 7 ? 'her gün' : 'hafta içi'}) ve gönderen başına günde en fazla {campaign.config.dailyLimitPerSender} e-postaya yayar. Yanıt verenlere, listeden çıkanlara ve geri dönenlere takip gitmez.
          </p>
        </div>
        <span className={campaign.status === 'running' ? 'inline-flex items-center gap-2 rounded-full border border-accent bg-accent px-3 py-1 text-xs text-on-accent' : 'pill'}>
          {campaign.status === 'running' ? <span className="live-dot" /> : null}
          {campaign.status === 'running' ? 'Gönderiyor' : campaign.status === 'paused' ? 'Durduruldu' : campaign.status === 'completed' ? 'Tamamlandı' : 'Başlatılmadı'}
        </span>
      </div>

      {campaign.status === 'paused' && campaign.pauseReason ? <div className="rounded-3xl border border-line bg-soft px-5 py-4 text-sm text-ink">{campaign.pauseReason}</div> : null}

      <CampaignControls
        status={campaign.status}
        ready={ready}
        estimateDays={estimateDays}
        perDay={perDay}
        provider={env.provider}
        providerLabel={emailProviderLabel(env.provider)}
        hasImap={env.senders.some((sender) => sender.imap)}
        cron={env.cronSecret}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="İlk e-posta planlanan" value={initialTotal} />
        <Metric label="Gönderilen" value={initialSent} hint={`%${progress} tamamlandı`} emphasis={initialSent > 0} />
        <Metric label="Sıradaki gönderim" value={next ? formatDateTime(next) : 'Yok'} />
        <Metric label="Tahmini son gönderim" value={overview.lastScheduledAt ? formatDateTime(overview.lastScheduledAt) : 'Yok'} />
      </section>

      {initialTotal ? (
        <div className="h-2.5 overflow-hidden rounded-full bg-soft">
          <div className="h-full rounded-full bg-accent-strong transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-mute">
              <th className="px-5 py-3">Adım</th>
              {statusOrder.map((status) => (
                <th key={status} className="px-3 py-3">
                  {messageStatusLabels[status]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[0, 1, 2].map((step) => (
              <tr key={step}>
                <td className="px-5 py-3 text-ink">{stepLabels[step]}</td>
                {statusOrder.map((status) => (
                  <td key={status} className="px-3 py-3 text-mute">
                    {cell(step, 'email', status) || ''}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-5 py-3 text-ink">WhatsApp</td>
              {statusOrder.map((status) => (
                <td key={status} className="px-3 py-3 text-mute">
                  {cell(0, 'whatsapp', status) || ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg text-ink">Sıradakiler</h2>
          {overview.upcoming.length === 0 ? <p className="mt-2 text-sm text-mute">Planlı mesaj yok.</p> : null}
          <ul className="mt-3 divide-y divide-line text-sm">
            {overview.upcoming.map(({ message, contact }) => (
              <li key={message.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/kisiler/${contact.id}`} className="min-w-0 truncate text-ink">
                  {contact.firstName} {contact.lastName} <span className="text-mute">· {contact.company}</span>
                </Link>
                <span className="shrink-0 text-xs text-mute">
                  {stepLabels[message.step]} · {formatDateTime(message.scheduledAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2 className="text-lg text-ink">Son gönderimler</h2>
          {overview.recent.length === 0 ? <p className="mt-2 text-sm text-mute">Henüz gönderim yok.</p> : null}
          <ul className="mt-3 divide-y divide-line text-sm">
            {overview.recent.map(({ message, contact }) => (
              <li key={message.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/kisiler/${contact.id}`} className="min-w-0 truncate text-ink">
                    {contact.firstName} {contact.lastName} <span className="text-mute">· {contact.company}</span>
                  </Link>
                  <MessageBadge status={message.status} />
                </div>
                <div className="mt-0.5 flex justify-between gap-3 text-xs text-mute">
                  <span className="truncate">{message.subject ?? stepLabels[message.step]}</span>
                  <span className="shrink-0">{formatDateTime(message.sentAt ?? message.updatedAt)}</span>
                </div>
                {message.status === 'failed' && message.lastError ? <div className="mt-0.5 text-[11px] text-mute">{message.lastError}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ConfigForm action={saveConfig} config={campaign.config} />
    </div>
  )
}
