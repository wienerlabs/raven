import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { listContacts } from '@/lib/queries'
import { hasAi } from '@/lib/env'
import { reviewLabels, stageLabels } from '@/lib/labels'
import { ContactsTable } from './ContactsTable'
import { ListActions } from './ListActions'

export const metadata: Metadata = { title: 'Kişiler' }

function buildHref(current: Record<string, string | undefined>, patch: Record<string, string | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries({ ...current, ...patch })) if (value) params.set(key, value)
  const query = params.toString()
  return query ? `/kisiler?${query}` : '/kisiler'
}

export default async function ContactsPage({ searchParams }: PageProps<'/kisiler'>) {
  const params = await searchParams
  const pick = (key: string) => {
    const value = params[key]
    return typeof value === 'string' && value ? value : undefined
  }
  const current = { q: pick('q'), review: pick('review'), stage: pick('stage'), flagged: pick('flagged'), pitch: pick('pitch') }
  const page = Number(pick('page') ?? 1) || 1
  const db = await getDb()
  const result = await listContacts(db, { ...current, page })
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl tracking-tight text-ink">Kişiler</h1>
          <p className="mt-1 text-sm text-mute">{result.total} kişi. Her satır, o kişiye özel hazırlanan çözümü taşır.</p>
        </div>
        <ListActions ai={hasAi()} />
      </div>

      <form className="flex flex-wrap items-center gap-2" action="/kisiler">
        <input name="q" defaultValue={current.q} placeholder="İsim, şirket, e-posta veya ünvan ara" className="input max-w-sm py-2.5 text-sm" />
        {current.review ? <input type="hidden" name="review" value={current.review} /> : null}
        {current.stage ? <input type="hidden" name="stage" value={current.stage} /> : null}
        <button type="submit" className="btn-ghost">
          Ara
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <Link href={buildHref(current, { review: undefined, page: undefined })} className={`chip ${!current.review ? 'chip-active' : ''}`}>
          Tüm inceleme durumları
        </Link>
        {(Object.keys(reviewLabels) as Array<keyof typeof reviewLabels>).map((key) => (
          <Link key={key} href={buildHref(current, { review: key, page: undefined })} className={`chip ${current.review === key ? 'chip-active' : ''}`}>
            {reviewLabels[key]}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-line" />
        <Link href={buildHref(current, { flagged: current.flagged ? undefined : '1', page: undefined })} className={`chip ${current.flagged ? 'chip-active' : ''}`}>
          Bayraklı
        </Link>
        <Link href={buildHref(current, { pitch: current.pitch === 'warnings' ? undefined : 'warnings', page: undefined })} className={`chip ${current.pitch === 'warnings' ? 'chip-active' : ''}`}>
          Uyarılı içerik
        </Link>
        <Link href={buildHref(current, { pitch: current.pitch === 'missing' ? undefined : 'missing', page: undefined })} className={`chip ${current.pitch === 'missing' ? 'chip-active' : ''}`}>
          İçeriği eksik
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={buildHref(current, { stage: undefined, page: undefined })} className={`chip ${!current.stage ? 'chip-active' : ''}`}>
          Tüm aşamalar
        </Link>
        {(Object.keys(stageLabels) as Array<keyof typeof stageLabels>).map((key) => (
          <Link key={key} href={buildHref(current, { stage: key, page: undefined })} className={`chip ${current.stage === key ? 'chip-active' : ''}`}>
            {stageLabels[key]}
          </Link>
        ))}
      </div>

      <ContactsTable rows={result.rows.map((row) => ({ ...row, lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null }))} />

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-mute">
          <span>
            Sayfa {result.page} / {pages}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link className="btn-ghost btn-sm" href={buildHref(current, { page: String(result.page - 1) })}>
                Önceki
              </Link>
            ) : null}
            {result.page < pages ? (
              <Link className="btn-ghost btn-sm" href={buildHref(current, { page: String(result.page + 1) })}>
                Sonraki
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
