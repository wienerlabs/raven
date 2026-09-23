'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Mail, Phone } from 'lucide-react'
import { bulkUpdate, type ActionResult } from '@/app/actions/contacts'
import { MotionButton } from '@/components/ui/MotionButton'
import { ReviewBadge, StageBadge } from '@/components/ui/Badges'
import type { ReviewStatus, Stage } from '@/lib/db/schema'

export interface ContactRow {
  id: string
  firstName: string
  lastName: string
  personFirst: string | null
  personLast: string | null
  title: string | null
  company: string
  companyName: string | null
  email: string | null
  phone: string | null
  language: 'tr' | 'en'
  relationship: 'prospect' | 'customer'
  reviewStatus: ReviewStatus
  stage: Stage
  flags: string[]
  solution: string | null
  warnings: number
  lastActivityAt: string | null
}

type BulkAction = Parameters<typeof bulkUpdate>[1]

const actions: Array<{ key: BulkAction; label: string; primary?: boolean }> = [
  { key: 'approve', label: 'Onayla', primary: true },
  { key: 'pending', label: 'İncelemeye al' },
  { key: 'hold', label: 'Beklet' },
  { key: 'exclude', label: 'Hariç tut' },
  { key: 'customer', label: 'Mevcut müşteri' },
  { key: 'prospect', label: 'Aday' },
]

export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const selectedIds = useMemo(() => [...selected], [selected])

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = (action: BulkAction) =>
    startTransition(async () => {
      const outcome = await bulkUpdate(selectedIds, action)
      setResult(outcome)
      setSelected(new Set())
      router.refresh()
    })

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-3xl border border-accent bg-accent-soft px-4 py-3">
          <span className="mr-2 text-sm text-ink">{selected.size} kişi seçili</span>
          {actions.map((action) => (
            <MotionButton key={action.key} small variant={action.primary ? 'primary' : 'ghost'} disabled={pending} onClick={() => run(action.key)}>
              {action.label}
            </MotionButton>
          ))}
          <button type="button" className="ml-auto text-xs text-mute underline" onClick={() => setSelected(new Set())}>
            Seçimi temizle
          </button>
        </div>
      ) : null}
      {result ? <p className="text-sm text-ink">{result.message}</p> : null}
      <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-mute">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  className="accent-[var(--color-accent-strong)]"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)))}
                />
              </th>
              <th className="px-2 py-3">Kişi</th>
              <th className="px-2 py-3">Şirket</th>
              <th className="px-2 py-3">Önerilen çözüm</th>
              <th className="px-2 py-3">İnceleme</th>
              <th className="px-2 py-3">Aşama</th>
              <th className="w-8 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const first = row.personFirst ?? row.firstName
              const last = row.personLast ?? row.lastName
              return (
                <tr key={row.id} className="row-link">
                  <td className="px-4 py-3 align-top">
                    <input type="checkbox" aria-label={`${first} seç`} className="mt-1 accent-[var(--color-accent-strong)]" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  <td className="px-2 py-3 align-top">
                    <Link href={`/kisiler/${row.id}`} className="block">
                      <span className="flex items-center gap-2 text-ink">
                        {first} {last}
                        {row.relationship === 'customer' ? <span className="rounded-full border border-accent bg-accent-soft px-2 text-[11px] text-ink">Müşteri</span> : null}
                        {row.language === 'en' ? <span className="pill px-2 py-0 text-[11px]">EN</span> : null}
                      </span>
                      <span className="mt-0.5 block max-w-[16rem] truncate text-xs text-mute">{row.title ?? 'Ünvan yok'}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-3 align-top">
                    <span className="block max-w-[14rem] truncate text-ink">{row.companyName ?? row.company}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-mute">
                      {row.email ? <Mail className="h-3 w-3" aria-label="E-posta var" /> : null}
                      {row.phone ? <Phone className="h-3 w-3" aria-label="Telefon var" /> : null}
                      <span className="max-w-[12rem] truncate">{row.email ?? row.phone}</span>
                    </span>
                  </td>
                  <td className="px-2 py-3 align-top">
                    {row.solution ? <span className="text-ink">{row.solution}</span> : <span className="text-mute">Henüz yok</span>}
                    {row.warnings > 0 || row.flags.length > 0 ? (
                      <span className="mt-0.5 block text-xs text-mute">
                        {row.warnings > 0 ? `${row.warnings} uyarı` : ''}
                        {row.warnings > 0 && row.flags.length > 0 ? ' · ' : ''}
                        {row.flags.length > 0 ? `${row.flags.length} bayrak` : ''}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-3 align-top">
                    <ReviewBadge status={row.reviewStatus} />
                  </td>
                  <td className="px-2 py-3 align-top">
                    <StageBadge stage={row.stage} />
                  </td>
                  <td className="px-2 py-3 align-top">
                    <Link href={`/kisiler/${row.id}`} aria-label="Ayrıntı" className="text-mute hover:text-ink">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-6 py-10 text-center text-sm text-mute">Bu filtreyle eşleşen kişi yok.</p> : null}
      </div>
    </div>
  )
}
