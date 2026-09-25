'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, CalendarCheck, FileUp, Inbox, LayoutDashboard, ListChecks, MessageCircle, MessageSquareText, Moon, Search, Send, Settings, ShieldAlert, Target, User, Users } from 'lucide-react'
import { searchContactsAction } from '@/app/actions/search'
import type { ContactHit } from '@/lib/search'
import { stageLabels } from '@/lib/labels'
import { useTheme } from './theme'

interface Entry {
  id: string
  label: string
  hint?: string
  href?: string
  run?: () => void
  icon: typeof LayoutDashboard
  words?: string
}

const pages: Entry[] = [
  { id: 'panel', label: 'Panel', hint: 'Bugün ve genel durum', href: '/', icon: LayoutDashboard },
  { id: 'kisiler', label: 'Kişiler', href: '/kisiler', icon: Users },
  { id: 'kampanya', label: 'Kampanya', href: '/kampanya', icon: Send },
  { id: 'yanitlar', label: 'Yanıtlar', href: '/yanitlar', icon: Inbox },
  { id: 'whatsapp', label: 'WhatsApp sohbetleri', href: '/whatsapp', icon: MessageCircle },
  { id: 'kuyruk', label: 'WhatsApp kuyruğu', hint: 'Odak modu', href: '/whatsapp?sekme=kuyruk', icon: Target },
  { id: 'kurulum', label: 'WhatsApp kurulumu', href: '/whatsapp?sekme=kurulum', icon: Settings, words: 'meta cloud api webhook şablon' },
  { id: 'ice-aktar', label: 'İçe aktar', hint: 'Excel ve içerik dosyası', href: '/ice-aktar', icon: FileUp },
  { id: 'ayarlar', label: 'Ayarlar', href: '/ayarlar', icon: Settings },
  { id: 'hazir', label: 'Hazır yanıtlar', hint: 'Ayarlar', href: '/ayarlar#hazir-yanitlar', icon: MessageSquareText, words: 'şablon snippet' },
]

const shortcuts: Entry[] = [
  { id: 'bekleyen', label: 'Yanıt bekleyen WhatsApp sohbetleri', href: '/whatsapp?filtre=bekleyen', icon: MessageCircle },
  { id: 'dogrulanmamis', label: 'Doğrulanmamış WhatsApp numaraları', href: '/whatsapp?filtre=dogrulanmamis', icon: ShieldAlert },
  { id: 'gorusme', label: 'Görüşme isteyenler', href: '/yanitlar?intent=meeting', icon: CalendarCheck },
  { id: 'onay', label: 'Onay bekleyen içerikler', href: '/kisiler?review=pending', icon: ListChecks },
  { id: 'inceleme', label: 'Hukuki incelemedeki kişiler', href: '/kisiler?review=hold', icon: ShieldAlert },
]

function fold(value: string): string {
  return value.toLocaleLowerCase('tr')
}

function Item({ entry, onSelect }: { entry: Entry; onSelect: (entry: Entry) => void }) {
  const Icon = entry.icon
  return (
    <Command.Item value={entry.id} onSelect={() => onSelect(entry)} className="group flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm text-ink data-[selected=true]:bg-accent-soft">
      <Icon className="h-4 w-4 shrink-0 text-mute group-data-[selected=true]:text-ink" />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.hint ? <span className="hidden shrink-0 text-xs text-mute sm:inline">{entry.hint}</span> : null}
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-mute opacity-0 transition group-data-[selected=true]:opacity-100" />
    </Command.Item>
  )
}

export function CommandPalette() {
  const router = useRouter()
  const { toggle } = useTheme()
  const input = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ContactHit[]>([])
  const [searching, setSearching] = useState(false)
  const [mac, setMac] = useState(true)

  useEffect(() => {
    setMac(/mac|iphone|ipad/i.test(navigator.userAgent))
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase('tr') === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => input.current?.focus())
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setHits([])
      setSearching(false)
      return
    }
    const ticket = ++request.current
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchContactsAction(term)
        if (ticket === request.current) setHits(result)
      } catch {
        if (ticket === request.current) setHits([])
      } finally {
        if (ticket === request.current) setSearching(false)
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const actions: Entry[] = useMemo(() => [{ id: 'tema', label: 'Temayı değiştir', hint: 'Koyu ya da açık', icon: Moon, run: toggle, words: 'karanlık aydınlık dark light' }], [toggle])
  const term = fold(query.trim())
  const match = (entry: Entry) => !term || fold(`${entry.label} ${entry.hint ?? ''} ${entry.words ?? ''}`).includes(term)
  const visiblePages = pages.filter(match)
  const visibleShortcuts = shortcuts.filter(match)
  const visibleActions = actions.filter(match)

  const select = (entry: Entry) => {
    setOpen(false)
    if (entry.run) entry.run()
    else if (entry.href) router.push(entry.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-line px-3 text-xs text-mute transition hover:border-accent-strong hover:text-ink"
        aria-label="Ara ya da komut çalıştır"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ara</span>
        <kbd className="hidden rounded-md border border-line px-1.5 text-[10px] leading-4 sm:inline">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Komut paleti">
            <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.div
              className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.16 }}
            >
              <Command
                shouldFilter={false}
                loop
                label="Komut paleti"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setOpen(false)
                  }
                }}
              >
                <div className="flex items-center gap-3 border-b border-line px-4">
                  <Search className="h-4 w-4 shrink-0 text-mute" />
                  <Command.Input ref={input} value={query} onValueChange={setQuery} placeholder="Kişi, şirket ya da sayfa arayın" className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-mute" />
                  <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 text-[10px] leading-4 text-mute sm:inline">Esc</kbd>
                </div>
                <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-8 text-center text-sm text-mute">{searching ? 'Aranıyor' : 'Sonuç yok.'}</Command.Empty>
                  {hits.length ? (
                    <Command.Group heading="Kişiler" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mute">
                      {hits.map((hit) => (
                        <Item key={hit.id} entry={{ id: `kisi-${hit.id}`, label: hit.name, hint: [hit.company, stageLabels[hit.stage]].filter(Boolean).join(' · '), href: `/kisiler/${hit.id}`, icon: User }} onSelect={select} />
                      ))}
                    </Command.Group>
                  ) : null}
                  {visibleShortcuts.length ? (
                    <Command.Group heading="Hızlı erişim" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mute">
                      {visibleShortcuts.map((entry) => (
                        <Item key={entry.id} entry={entry} onSelect={select} />
                      ))}
                    </Command.Group>
                  ) : null}
                  {visiblePages.length ? (
                    <Command.Group heading="Sayfalar" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mute">
                      {visiblePages.map((entry) => (
                        <Item key={entry.id} entry={entry} onSelect={select} />
                      ))}
                    </Command.Group>
                  ) : null}
                  {visibleActions.length ? (
                    <Command.Group heading="Görünüm" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-mute">
                      {visibleActions.map((entry) => (
                        <Item key={entry.id} entry={entry} onSelect={select} />
                      ))}
                    </Command.Group>
                  ) : null}
                </Command.List>
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[11px] text-mute">
                  <span>Oklarla gezin, Enter ile açın</span>
                  <span>{mac ? '⌘K' : 'Ctrl K'} ile her yerden açılır</span>
                </div>
              </Command>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  )
}
