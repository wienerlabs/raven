import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import type { ChatMessage } from '@/lib/inbox/chat'
import { clockTime, dayLabel, localDayKey } from '@/lib/whatsapp/format'

const urlPattern = /(https?:\/\/[^\s<>"']+)/g

export function linkify(text: string): ReactNode[] {
  return text.split(urlPattern).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part
    const url = part.replace(/[.,;:!?)]+$/, '')
    return (
      <span key={index}>
        <a href={url} target="_blank" rel="noreferrer noopener" className="break-all underline decoration-mute/60 underline-offset-2 transition hover:decoration-ink">
          {url}
        </a>
        {part.slice(url.length)}
      </span>
    )
  })
}

function Bubble({ message, label }: { message: ChatMessage; label: string }) {
  const out = message.direction === 'out'
  const touch = message.kind === 'first-touch' || message.kind === 'greeting'
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-[88%] rounded-3xl px-4 py-2.5 text-sm leading-6 text-ink sm:max-w-[74%] ' +
          (out ? 'rounded-br-lg bg-accent-soft ' : 'rounded-bl-lg border border-line bg-soft ') +
          (touch ? 'border border-dashed border-accent-strong' : '')
        }
      >
        {touch ? <p className="mb-1 text-[11px] text-mute">{label}</p> : null}
        <p className="whitespace-pre-line break-words">{linkify(message.text)}</p>
        <p className="mt-1 text-right text-[11px] text-mute">
          {clockTime(message.at)}
          {out && !touch ? ` · ${label}` : ''}
        </p>
      </div>
    </div>
  )
}

export function MessageList({ messages, now, label }: { messages: ChatMessage[]; now: Date; label: (message: ChatMessage) => string }) {
  const groups: Array<{ key: string; label: string; items: ChatMessage[] }> = []
  for (const message of messages) {
    const key = localDayKey(message.at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(message)
    else groups.push({ key, label: dayLabel(message.at, now), items: [message] })
  }
  if (!groups.length) return <p className="py-10 text-center text-sm text-mute">Bu sohbette henüz mesaj yok.</p>
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <div className="flex justify-center py-3">
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">{group.label}</span>
          </div>
          {group.items.map((message) =>
            message.kind === 'start' ? (
              <div key={`${message.kind}-${message.id}`} className="flex justify-center py-1">
                <span className="rounded-full bg-soft px-3 py-1 text-[11px] text-mute">
                  {label(message)} · {clockTime(message.at)}
                </span>
              </div>
            ) : (
              <Bubble key={`${message.kind}-${message.id}`} message={message} label={label(message)} />
            ),
          )}
        </div>
      ))}
    </div>
  )
}

export function InfoLine({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line px-3 py-2">
      <div className="text-[11px] text-mute">{label}</div>
      <div className="break-all text-sm text-ink">{value}</div>
      {note ? <div className="text-[11px] text-mute">{note}</div> : null}
    </div>
  )
}

export function LinkRow({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  const content = (
    <>
      <span>{label}</span>
      {external ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
    </>
  )
  const className = 'flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm text-ink transition hover:bg-soft'
  return external ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

export const inboxShortcuts: Array<[string, string]> = [
  ['J', 'Sonraki sohbet'],
  ['K', 'Önceki sohbet'],
  ['R', 'Yanıt yaz'],
  ['E', 'Yanıtlandı işaretle'],
  ['/', 'Sohbetlerde ara, yazarken hazır yanıtlar'],
]

export function ShortcutList() {
  return (
    <section>
      <h3 className="text-xs text-mute">Kısayollar</h3>
      <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
        {inboxShortcuts.map(([key, label]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-line bg-soft px-1.5 py-0.5 text-[11px] text-ink">{key}</kbd>
            </dt>
            <dd className="text-mute">{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
