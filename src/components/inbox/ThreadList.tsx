'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Clock, Search, ShieldAlert, X } from 'lucide-react'
import { inboxFilters, inboxHref, initials, threadMatches, type FilterKey } from '@/lib/whatsapp/format'

export interface ThreadItem {
  contactId: string
  name: string
  company: string
  from: string | null
  phoneLabel: string
  verified: boolean
  unhandled: number
  preview: string
  previewOut: boolean
  timeLabel: string
  closingSoon: boolean
  note?: string | null
}

export function Avatar({ name, size = 'md', flagged = false }: { name: string; size?: 'md' | 'lg'; flagged?: boolean }) {
  return (
    <span className={'relative inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-accent-soft text-ink ' + (size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm')} aria-hidden>
      {initials(name)}
      {flagged ? (
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-mute">
          <ShieldAlert className="h-2.5 w-2.5" />
        </span>
      ) : null}
    </span>
  )
}

export function ThreadList({
  threads,
  selectedId,
  filter,
  counts,
  base = '/whatsapp',
  filters = ['all', 'waiting', 'unverified'],
  placeholder = 'İsim, şirket ya da numara',
}: {
  threads: ThreadItem[]
  selectedId: string | null
  filter: FilterKey
  counts: Partial<Record<FilterKey, number>>
  base?: string
  filters?: FilterKey[]
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => (query.trim() ? threads.filter((thread) => threadMatches(thread, query)) : threads), [threads, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-line p-3">
        <label className="flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-2 text-sm transition focus-within:border-accent-strong">
          <Search className="h-4 w-4 shrink-0 text-mute" />
          <input
            id="wa-search"
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-mute"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setQuery('')
                event.currentTarget.blur()
              }
            }}
            aria-label="Sohbetlerde ara"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="text-mute transition hover:text-ink" aria-label="Aramayı temizle">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sohbet filtresi">
          {inboxFilters
            .filter((item) => filters.includes(item.key))
            .map((item) => (
            <Link key={item.key} href={inboxHref(item.key, selectedId, base)} role="tab" aria-selected={filter === item.key} className={`chip shrink-0 ${filter === item.key ? 'chip-active' : ''}`} scroll={false}>
              {item.label}
              <span className={filter === item.key ? 'text-on-accent' : 'text-ink'}>{counts[item.key] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5" aria-label="Sohbetler">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-mute">{query ? 'Aramanızla eşleşen sohbet yok.' : filter === 'waiting' ? 'Yanıt bekleyen sohbet yok.' : filter === 'unverified' ? 'Doğrulanmamış numara yok.' : 'Henüz sohbet yok.'}</li>
        ) : null}
        {visible.map((thread) => {
          const active = thread.contactId === selectedId
          return (
            <li key={thread.contactId}>
              <Link
                href={inboxHref(filter, thread.contactId, base)}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={'flex items-start gap-3 rounded-2xl px-3 py-3 transition ' + (active ? 'bg-accent-soft' : 'hover:bg-soft')}
              >
                <Avatar name={thread.name} flagged={!thread.verified} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={'truncate text-sm ' + (thread.unhandled ? 'text-ink' : 'text-body')}>{thread.name}</span>
                    <span className={'shrink-0 text-[11px] ' + (thread.unhandled ? 'text-ink' : 'text-mute')}>{thread.timeLabel}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-mute">
                    <span className="truncate">{thread.company}</span>
                    {thread.note ? <span className="shrink-0 rounded-full border border-line px-1.5 text-[10px] text-mute">{thread.note}</span> : null}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className={'min-w-0 flex-1 truncate text-xs ' + (thread.unhandled ? 'text-body' : 'text-mute')}>
                      {thread.previewOut ? <span className="text-mute">Siz: </span> : null}
                      {thread.preview || 'Mesaj'}
                    </span>
                    {thread.closingSoon ? (
                      <span title="Yanıt penceresi kapanmak üzere" className="inline-flex shrink-0 text-ink">
                        <Clock className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                    {thread.unhandled ? <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] text-on-accent">{thread.unhandled}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
