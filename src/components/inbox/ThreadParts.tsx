'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock, Info, RotateCcw, X } from 'lucide-react'
import { setWhatsappHandledAction } from '@/app/actions/whatsapp'
import { setTelegramHandledAction } from '@/app/actions/telegram'
import { remaining, remainingShort } from '@/lib/whatsapp/format'

const CLOSING_SOON_MS = 3 * 60 * 60 * 1000

export type InboxChannel = 'whatsapp' | 'telegram'

function handledAction(channel: InboxChannel) {
  return channel === 'telegram' ? setTelegramHandledAction : setWhatsappHandledAction
}

export function useNow(initial: string, everyMs = 30000): number {
  const [now, setNow] = useState(() => new Date(initial).getTime())
  useEffect(() => {
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function MessageScroller({ marker, className, children }: { marker: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  useEffect(() => {
    const element = ref.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [marker])
  return (
    <div
      ref={ref}
      className={className}
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96
      }}
    >
      {children}
    </div>
  )
}

export function WindowChip({ closesAt, now }: { closesAt: string; now: string }) {
  const current = useNow(now)
  const left = new Date(closesAt).getTime() - current
  if (left <= 0) {
    return (
      <span className="pill" title="Son mesajın üzerinden 24 saat geçti. Kişi yeniden yazana kadar yalnızca onaylı şablonla ulaşılabilir.">
        <span className="@lg:hidden">Kapandı</span>
        <span className="hidden @lg:inline">Pencere kapandı</span>
      </span>
    )
  }
  const soon = left < CLOSING_SOON_MS
  return (
    <span
      className={'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs ' + (soon ? 'border-accent bg-accent text-on-accent' : 'border-line bg-soft text-mute')}
      title="WhatsApp kuralı: son mesajdan sonraki 24 saat içinde serbest metinle yanıt verilebilir."
    >
      <Clock className="h-3 w-3" />
      <span className="@lg:hidden">{remainingShort(left)}</span>
      <span className="hidden @lg:inline">{remaining(left)}</span>
    </span>
  )
}

export function HandledToggle({ contactId, waiting, channel = 'whatsapp' }: { contactId: string; waiting: boolean; channel?: InboxChannel }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await handledAction(channel)(contactId, waiting)
          router.refresh()
        })
      }
      className="chip"
      title={waiting ? 'Yanıtlandı olarak işaretle (E)' : 'Yeniden bekleyenlere al'}
    >
      {waiting ? <Check className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
      <span className="hidden @xl:inline">{waiting ? 'Yanıtlandı' : 'Bekleyene al'}</span>
    </button>
  )
}

export function InfoDrawer({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return (
    <>
      <button type="button" className="chip 2xl:hidden" onClick={() => setOpen(true)} aria-label={title} aria-expanded={open}>
        <Info className="h-3.5 w-3.5" />
        <span className="hidden @xl:inline">Bilgi</span>
      </button>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-50 2xl:hidden">
            <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className="absolute inset-y-0 right-0 flex w-[min(22rem,100vw)] flex-col border-l border-line bg-surface"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <span className="text-sm text-ink">{title}</span>
                <button type="button" className="chip" onClick={() => setOpen(false)} aria-label="Kapat">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

export function InboxKeys({ order, selectedId, hrefs, waiting, channel = 'whatsapp' }: { order: string[]; selectedId: string | null; hrefs: Record<string, string>; waiting: boolean; channel?: InboxChannel }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
      const key = event.key.toLocaleLowerCase('tr')
      const index = selectedId ? order.indexOf(selectedId) : -1
      if (key === 'j' || key === 'k') {
        const next = key === 'j' ? Math.min(order.length - 1, index + 1) : Math.max(0, index - 1)
        const target = order[next]
        if (target && target !== selectedId) {
          event.preventDefault()
          router.push(hrefs[target], { scroll: false })
        }
        return
      }
      if (key === 'r' && selectedId) {
        const composer = document.getElementById('wa-composer')
        if (composer instanceof HTMLTextAreaElement && !composer.disabled) {
          event.preventDefault()
          composer.focus()
        }
        return
      }
      if (key === 'e' && selectedId && waiting && !event.repeat) {
        event.preventDefault()
        startTransition(async () => {
          await handledAction(channel)(selectedId, true)
          router.refresh()
        })
        return
      }
      if (key === '/') {
        const search = document.getElementById('wa-search')
        if (search instanceof HTMLInputElement) {
          event.preventDefault()
          search.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order, selectedId, hrefs, waiting, channel, router])
  return null
}
