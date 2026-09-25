'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ExternalLink, MessageSquareText, Send, Sparkles, Undo2 } from 'lucide-react'
import { draftWhatsappReplyAction, markManualReplyAction, replyWhatsappAction } from '@/app/actions/whatsapp'
import { draftTelegramReplyAction, replyTelegramAction } from '@/app/actions/telegram'
import { MotionButton } from '@/components/ui/MotionButton'
import { useNow } from './ThreadParts'

export interface SnippetOption {
  id: string
  title: string
  text: string
}

const LIMIT = 4000

function SnippetMenu({ snippets, onPick, onClose }: { snippets: SnippetOption[]; onPick: (snippet: SnippetOption) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const list = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr')
    return needle ? snippets.filter((item) => `${item.title} ${item.text}`.toLocaleLowerCase('tr').includes(needle)) : snippets
  }, [snippets, query])
  const active = Math.min(index, Math.max(0, list.length - 1))

  const onKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setIndex((active + 1) % Math.max(1, list.length))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setIndex((active - 1 + list.length) % Math.max(1, list.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (list[active]) onPick(list[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_48px_rgba(0,0,0,0.22)]" role="dialog" aria-label="Hazır yanıtlar">
      <div className="border-b border-line p-2">
        <input
          autoFocus
          className="w-full bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-mute"
          placeholder="Hazır yanıt ara"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onKeyDown={onKey}
          aria-label="Hazır yanıt ara"
        />
      </div>
      <ul role="listbox" className="max-h-64 overflow-y-auto p-1">
        {list.map((item, position) => (
          <li key={item.id} role="option" aria-selected={position === active}>
            <button
              type="button"
              onMouseEnter={() => setIndex(position)}
              onClick={() => onPick(item)}
              className={'block w-full rounded-xl px-3 py-2 text-left transition ' + (position === active ? 'bg-accent-soft' : 'hover:bg-soft')}
            >
              <span className="block text-sm text-ink">{item.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-mute">{item.text}</span>
            </button>
          </li>
        ))}
        {list.length === 0 ? <li className="px-3 py-4 text-center text-xs text-mute">Eşleşen hazır yanıt yok.</li> : null}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-[11px] text-mute">
        <span>Oklarla seçin, Enter ile ekleyin</span>
        <a href="/ayarlar#hazir-yanitlar" className="underline-offset-2 transition hover:text-ink hover:underline">
          Düzenle
        </a>
      </div>
    </div>
  )
}

export function Composer({
  contactId,
  channel,
  waDigits = null,
  closesAt = null,
  now,
  firstName,
  snippets,
  ai,
  blockedReason = null,
}: {
  contactId: string
  channel: 'api' | 'app' | 'telegram'
  waDigits?: string | null
  closesAt?: string | null
  now: string
  firstName: string
  snippets: SnippetOption[]
  ai: boolean
  blockedReason?: string | null
}) {
  const router = useRouter()
  const current = useNow(now)
  const wrapper = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const skipSave = useRef(true)
  const [text, setText] = useState('')
  const [opened, setOpened] = useState(false)
  const [menu, setMenu] = useState(false)
  const [undo, setUndo] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [mac, setMac] = useState(true)
  const [pending, startTransition] = useTransition()
  const direct = channel !== 'app'
  const storageKey = `raven.${channel === 'telegram' ? 'tg' : 'wa'}.draft.${contactId}`
  const windowOpen = channel !== 'api' || (closesAt ? new Date(closesAt).getTime() > current : false)
  const ready = text.trim().length >= 2 && text.length <= LIMIT
  const waLink = waDigits ? `https://wa.me/${waDigits}${text.trim() ? `?text=${encodeURIComponent(text.trim())}` : ''}` : null

  useEffect(() => {
    setMac(/mac|iphone|ipad/i.test(navigator.userAgent))
    let saved: string | null = null
    try {
      saved = localStorage.getItem(storageKey)
    } catch {
      saved = null
    }
    if (saved) setText(saved)
  }, [storageKey])

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    try {
      if (text) localStorage.setItem(storageKey, text)
      else localStorage.removeItem(storageKey)
    } catch {
      return
    }
  }, [storageKey, text])

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 208)}px`
  }, [text, windowOpen])

  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (wrapper.current && event.target instanceof Node && !wrapper.current.contains(event.target)) setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  const focusEnd = (caret?: number) => {
    requestAnimationFrame(() => {
      const element = field.current
      if (!element) return
      element.focus()
      const position = caret ?? element.value.length
      element.setSelectionRange(position, position)
    })
  }

  const reset = (message: string) => {
    setText('')
    setOpened(false)
    setUndo(null)
    setNotice({ ok: true, text: message })
    router.refresh()
  }

  const send = () => {
    if (!ready || pending) return
    startTransition(async () => {
      const result = channel === 'telegram' ? await replyTelegramAction(contactId, text) : await replyWhatsappAction(contactId, text)
      if (result.ok) reset(result.message)
      else setNotice({ ok: false, text: result.message })
    })
  }

  const markSent = () => {
    if (!ready || pending) return
    startTransition(async () => {
      const result = await markManualReplyAction(contactId, text)
      if (result.ok) reset('Yanıt sohbete kaydedildi.')
      else setNotice({ ok: false, text: result.message })
    })
  }

  const openApp = () => {
    if (!waLink) return
    window.open(waLink, '_blank', 'noopener,noreferrer')
    setOpened(true)
  }

  const draft = async () => {
    if (drafting) return
    setDrafting(true)
    setNotice(null)
    try {
      const result = channel === 'telegram' ? await draftTelegramReplyAction(contactId) : await draftWhatsappReplyAction(contactId)
      if (result.ok) {
        setUndo(text)
        setText(result.text)
        setOpened(false)
        setNotice({ ok: true, text: 'Taslak hazır. Göndermeden önce okuyup düzenleyin.' })
        focusEnd(result.text.length)
      } else {
        setNotice({ ok: false, text: result.message })
      }
    } finally {
      setDrafting(false)
    }
  }

  const insert = (snippet: SnippetOption) => {
    const element = field.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    const before = text.slice(0, start)
    const after = text.slice(end)
    const glue = before && !/\s$/.test(before) ? ' ' : ''
    const next = `${before}${glue}${snippet.text}${after}`.slice(0, LIMIT)
    setText(next)
    setMenu(false)
    setOpened(false)
    focusEnd(before.length + glue.length + snippet.text.length)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (direct) send()
      else if (opened) markSent()
      else openApp()
      return
    }
    if (event.key === '/' && !text && snippets.length) {
      event.preventDefault()
      setMenu(true)
      return
    }
    if (event.key === 'Escape') event.currentTarget.blur()
  }

  if (blockedReason) {
    return (
      <div className="border-t border-line p-3">
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-xs leading-5 text-mute">{blockedReason}</p>
      </div>
    )
  }

  if (!windowOpen) {
    return (
      <div className="border-t border-line p-3">
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-xs leading-5 text-mute">
          24 saatlik yanıt penceresi kapandı. WhatsApp kuralı gereği {firstName} yeniden yazana kadar yalnızca onaylı şablonla ulaşılabilir. Görüşmeyi sürdürmek için e-posta ya da telefonla dönebilirsiniz.
        </p>
      </div>
    )
  }

  const shortcut = mac ? '⌘ Enter' : 'Ctrl Enter'
  const hint = direct ? `${shortcut} ile gönderin` : opened ? `${shortcut} ile kaydedin` : `${shortcut} ile WhatsApp'ta açın`

  return (
    <div className="border-t border-line p-3">
      <div ref={wrapper} className="relative rounded-3xl border border-line bg-canvas transition focus-within:border-accent-strong">
        {menu ? <SnippetMenu snippets={snippets} onPick={insert} onClose={() => { setMenu(false); focusEnd() }} /> : null}
        <textarea
          id="wa-composer"
          ref={field}
          rows={2}
          maxLength={LIMIT}
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (opened) setOpened(false)
          }}
          onKeyDown={onKeyDown}
          placeholder={direct ? `${firstName} için yanıtınız. Hazır yanıtlar için / yazın.` : `${firstName} için yanıtınız. Metin WhatsApp'ta hazır açılır.`}
          aria-label="Yanıt metni"
          className="block max-h-32 min-h-[3.25rem] w-full resize-none bg-transparent px-4 pt-3 text-sm leading-6 text-ink outline-none placeholder:text-mute @lg:max-h-52"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 pt-1">
          <button type="button" className={`chip ${menu ? 'chip-active' : ''}`} onClick={() => setMenu((value) => !value)} aria-expanded={menu} disabled={!snippets.length}>
            <MessageSquareText className="h-3.5 w-3.5" /> Hazır yanıtlar
          </button>
          {ai ? (
            <button type="button" className="chip" onClick={draft} disabled={drafting}>
              <Sparkles className={'h-3.5 w-3.5 ' + (drafting ? 'animate-pulse' : '')} /> {drafting ? 'Yazılıyor' : 'AI taslak'}
            </button>
          ) : null}
          {undo !== null ? (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setText(undo)
                setUndo(null)
                setNotice(null)
                focusEnd()
              }}
            >
              <Undo2 className="h-3.5 w-3.5" /> Geri al
            </button>
          ) : null}
          <span className="ml-auto hidden px-1 text-[11px] text-mute @xl:inline">{text.length > LIMIT - 600 ? `${text.length}/${LIMIT}` : hint}</span>
          {direct ? (
            <MotionButton small disabled={!ready || pending} onClick={send} className="ml-auto @xl:ml-0">
              <Send className="h-3.5 w-3.5" /> {pending ? 'Gönderiliyor' : 'Gönder'}
            </MotionButton>
          ) : opened ? (
            <>
              <button type="button" className="chip" onClick={openApp}>
                <ExternalLink className="h-3.5 w-3.5" /> Yeniden aç
              </button>
              <MotionButton small disabled={!ready || pending} onClick={markSent} title={ready ? undefined : 'Kaydetmek için gönderdiğiniz metni buraya yazın'}>
                <Check className="h-3.5 w-3.5" /> Gönderildi olarak kaydet
              </MotionButton>
            </>
          ) : (
            <MotionButton small disabled={!waLink} onClick={openApp} className="ml-auto @xl:ml-0">
              <ExternalLink className="h-3.5 w-3.5" /> WhatsApp&apos;ta aç
            </MotionButton>
          )}
        </div>
      </div>
      {notice ? (
        <p role="status" className={'mt-2 flex items-center gap-1.5 px-2 text-xs ' + (notice.ok ? 'text-body' : 'text-ink')}>
          {notice.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {notice.text}
        </p>
      ) : channel === 'app' ? (
        <p className="mt-2 px-2 text-[11px] text-mute">Cloud API bağlı değil: mesaj kendi WhatsApp&apos;ınızda açılır, gönderdikten sonra buraya kaydedin.</p>
      ) : null}
    </div>
  )
}
