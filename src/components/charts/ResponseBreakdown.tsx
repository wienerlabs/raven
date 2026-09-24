import { intentLabels } from '@/lib/labels'
import type { Intent } from '@/lib/db/schema'

const order: Intent[] = ['meeting', 'info', 'later', 'not_interested', 'other']
const strength: Record<Intent, number> = { meeting: 100, info: 72, later: 48, not_interested: 30, other: 18 }

function share(value: number, total: number): string {
  if (!total) return '%0'
  return `%${Math.round((value / total) * 100)}`
}

function duration(hours: number | null): string {
  if (hours === null) return 'Henüz yanıt yok'
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} dakika`
  if (hours < 48) return `${hours.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} saat`
  return `${(hours / 24).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} gün`
}

function tint(intent: Intent): string {
  return `color-mix(in srgb, var(--color-chart) ${strength[intent]}%, transparent)`
}

export function ResponseBreakdown({
  intents,
  medianHours,
  sectors,
  anySent,
}: {
  intents: Partial<Record<Intent, number>>
  medianHours: number | null
  sectors: Array<{ sector: string; people: number; contacted: number; responded: number }>
  anySent: boolean
}) {
  const total = order.reduce((sum, intent) => sum + (intents[intent] ?? 0), 0)
  const maxPeople = Math.max(1, ...sectors.map((row) => row.people))
  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="card">
        <h2 className="text-lg text-ink">Yanıtların niteliği</h2>
        <p className="mt-1 text-sm text-mute">Her kişinin en son verdiği yanıta göre.</p>
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-soft" aria-hidden>
          {order.map((intent) => {
            const value = intents[intent] ?? 0
            return value ? <span key={intent} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(value / total) * 100}%`, background: tint(intent) }} /> : null
          })}
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {order.map((intent) => {
            const value = intents[intent] ?? 0
            return (
              <li key={intent} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-body">
                  <span className="h-2.5 w-2.5 rounded-full border border-line" style={{ background: tint(intent) }} />
                  {intentLabels[intent]}
                </span>
                <span className="text-ink">
                  {value} <span className="text-xs text-mute">{share(value, total)}</span>
                </span>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-mute">
          <span>İlk yanıta kadar geçen süre (ortanca)</span>
          <span className="text-ink">{duration(medianHours)}</span>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg text-ink">Sektörlere göre dönüş</h2>
        <p className="mt-1 text-sm text-mute">{anySent ? 'Gönderim yapılan kişilerden yanıt verenlerin oranı.' : 'Gönderim henüz başlamadı. Şimdilik listedeki sektör dağılımı görünüyor.'}</p>
        <ul className="mt-5 space-y-3">
          {sectors.length === 0 ? <li className="text-sm text-mute">İçerik hazırlanan kişi yok.</li> : null}
          {sectors.map((row) => {
            const rate = anySent ? (row.contacted ? row.responded / row.contacted : 0) : row.people / maxPeople
            return (
              <li key={row.sector}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{row.sector}</span>
                  <span className="shrink-0 text-xs text-mute">{anySent ? `${row.responded}/${row.contacted} · ${share(row.responded, row.contacted)}` : `${row.people} kişi`}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft">
                  <div className="h-full rounded-full bg-chart" style={{ width: `${Math.max(rate > 0 ? 3 : 0, rate * 100)}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
