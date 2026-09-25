'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, LayoutList, Target, X } from 'lucide-react'
import { cancelWhatsapp, markWhatsappSent } from '@/app/actions/data'
import { MotionButton } from '@/components/ui/MotionButton'
import { Avatar } from '@/components/whatsapp/inbox/ThreadList'

export interface QueueItem {
  id: string
  contactId: string
  name: string
  company: string
  phone: string
  link: string | null
  text: string
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function Key({ children }: { children: string }) {
  return <kbd className="ml-1 hidden rounded-md border border-current/30 px-1 text-[10px] leading-4 opacity-70 sm:inline">{children}</kbd>
}

export function QueueFocus({ items }: { items: QueueItem[] }) {
  const router = useRouter()
  const [view, setView] = useState<'focus' | 'list'>('focus')
  const [index, setIndex] = useState(0)
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [sent, setSent] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const inflight = useRef(new Set<string>())
  const visible = useMemo(() => items.filter((item) => !gone.has(item.id)), [items, gone])
  const position = visible.length ? Math.min(index, visible.length - 1) : 0
  const current = visible[position] ?? null
  const total = visible.length + sent

  const settle = (id: string, task: () => Promise<{ ok: boolean; message: string }>, countAsSent: boolean) => {
    if (inflight.current.has(id)) return
    inflight.current.add(id)
    setGone((set) => new Set(set).add(id))
    if (countAsSent) setSent((value) => value + 1)
    setError(null)
    startTransition(async () => {
      const result = await task().catch(() => ({ ok: false, message: 'İşlem kaydedilemedi, yeniden deneyin.' }))
      if (!result.ok) {
        inflight.current.delete(id)
        setGone((set) => {
          const next = new Set(set)
          next.delete(id)
          return next
        })
        if (countAsSent) setSent((value) => Math.max(0, value - 1))
        setError(result.message)
      }
      router.refresh()
    })
  }

  const open = (item: QueueItem) => {
    if (!item.link) return
    window.open(item.link, '_blank', 'noopener,noreferrer')
    setOpened((set) => new Set(set).add(item.id))
  }
  const markSent = (item: QueueItem) => settle(item.id, () => markWhatsappSent(item.id), true)
  const remove = (item: QueueItem) => settle(item.id, () => cancelWhatsapp(item.id), false)
  const move = (step: number) => setIndex(visible.length ? (position + step + visible.length) % visible.length : 0)
  const copy = async (item: QueueItem) => {
    try {
      await navigator.clipboard.writeText(item.text)
      setCopied(item.id)
    } catch {
      setCopied(null)
    }
  }

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (view !== 'focus' || !current) return
    if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
    const key = event.key.toLocaleLowerCase('tr')
    if ((key === 'o' || key === 'g') && event.repeat) return
    if (key === 'o') {
      event.preventDefault()
      open(current)
    } else if (key === 'g') {
      event.preventDefault()
      markSent(current)
    } else if (key === 's' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(-1)
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  if (!current) {
    return (
      <div className="card flex flex-col items-center py-12 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-accent bg-accent text-on-accent">
          <Check className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg text-ink">Kuyruk tamamlandı</h2>
        <p className="mt-1 text-sm text-mute">{sent ? `Bu oturumda ${sent} mesaj gönderildi olarak işaretlendi.` : 'Elle gönderilecek mesaj kalmadı.'}</p>
      </div>
    )
  }

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="inline-flex rounded-full border border-line bg-canvas p-1" role="tablist" aria-label="Görünüm">
          <button type="button" role="tab" aria-selected={view === 'focus'} onClick={() => setView('focus')} className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ' + (view === 'focus' ? 'bg-accent text-on-accent' : 'text-mute hover:text-ink')}>
            <Target className="h-3.5 w-3.5" /> Odak
          </button>
          <button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setView('list')} className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition ' + (view === 'list' ? 'bg-accent text-on-accent' : 'text-mute hover:text-ink')}>
            <LayoutList className="h-3.5 w-3.5" /> Liste
          </button>
        </div>
        <div className="flex min-w-[12rem] flex-1 items-center justify-end gap-3 text-xs text-mute">
          <span>{sent} gönderildi · {visible.length} kaldı</span>
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-soft" aria-hidden>
            <span className="block h-full rounded-full bg-accent-strong transition-[width]" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} />
          </span>
        </div>
      </div>

      {view === 'focus' ? (
        <div className="p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div key={current.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={current.name} />
                  <div>
                    <div className="text-lg tracking-tight text-ink">{current.name}</div>
                    <div className="text-sm text-mute">
                      {current.company} · {current.phone || 'Numara yok'}
                    </div>
                  </div>
                </div>
                <span className="pill">
                  {position + 1} / {visible.length}
                </span>
              </div>
              <div className="mt-5 flex justify-end">
                <p className="max-w-[92%] whitespace-pre-line rounded-3xl rounded-br-lg bg-accent-soft px-4 py-3 text-sm leading-6 text-ink sm:max-w-[80%]">{current.text}</p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <MotionButton small variant={opened.has(current.id) ? 'ghost' : 'primary'} disabled={!current.link} onClick={() => open(current)}>
                  <ExternalLink className="h-3.5 w-3.5" /> WhatsApp&apos;ta aç <Key>O</Key>
                </MotionButton>
                <MotionButton small variant={opened.has(current.id) ? 'primary' : 'ghost'} onClick={() => markSent(current)}>
                  <Check className="h-3.5 w-3.5" /> Gönderildi <Key>G</Key>
                </MotionButton>
                <MotionButton small variant="ghost" onClick={() => move(1)} disabled={visible.length < 2}>
                  Atla <ArrowRight className="h-3.5 w-3.5" /> <Key>S</Key>
                </MotionButton>
                <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
                <button type="button" className="chip" onClick={() => copy(current)}>
                  {copied === current.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === current.id ? 'Kopyalandı' : 'Metni kopyala'}
                </button>
                <button type="button" className="chip" onClick={() => remove(current)}>
                  <X className="h-3.5 w-3.5" /> Kuyruktan çıkar
                </button>
                <button type="button" className="chip ml-auto" onClick={() => move(-1)} disabled={visible.length < 2} aria-label="Önceki mesaj">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-4 text-xs text-mute">WhatsApp&apos;ta açılan metni gönderin, sonra Gönderildi deyin. Sıradaki kişi kendiliğinden gelir.</p>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Avatar name={item.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{item.name}</div>
                <div className="truncate text-xs text-mute">
                  {item.company} · {item.phone || 'Numara yok'}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="chip" disabled={!item.link} onClick={() => open(item)}>
                  <ExternalLink className="h-3.5 w-3.5" /> Aç
                </button>
                <button type="button" className={`chip ${opened.has(item.id) ? 'chip-active' : ''}`} onClick={() => markSent(item)}>
                  <Check className="h-3.5 w-3.5" /> Gönderildi
                </button>
                <button type="button" className="chip" onClick={() => remove(item)} aria-label={`${item.name} kuyruktan çıkar`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="status" className="border-t border-line px-5 py-3 text-xs text-ink">
          {error}
        </p>
      ) : null}
    </section>
  )
}
