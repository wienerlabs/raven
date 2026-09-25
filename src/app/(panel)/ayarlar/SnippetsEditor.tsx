'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { saveSnippetsAction } from '@/app/actions/whatsapp'
import { MotionButton } from '@/components/ui/MotionButton'

interface Snippet {
  id: string
  title: string
  body: string
}

interface Row extends Snippet {
  key: string
}

const variables: Array<{ token: string; label: string }> = [
  { token: '{ad}', label: 'Hitap adı' },
  { token: '{şirket}', label: 'Şirket' },
  { token: '{çözüm}', label: 'Önerilen çözüm' },
  { token: '{taslak}', label: 'Taslak sayfası bağlantısı' },
  { token: '{takvim}', label: 'Takvim bağlantısı' },
  { token: '{gönderen}', label: 'Adınız' },
]

const MAX_ITEMS = 20

function rows(list: Snippet[]): Row[] {
  return list.map((item) => ({ ...item, key: item.id }))
}

function plain(list: Array<Snippet | Row>): string {
  return JSON.stringify(list.map(({ id, title, body }) => ({ id, title, body })))
}

export function SnippetsEditor({ initial, defaults }: { initial: Snippet[]; defaults: Snippet[] }) {
  const router = useRouter()
  const [items, setItems] = useState<Row[]>(() => rows(initial))
  const [saved, setSaved] = useState(() => plain(initial))
  const [focused, setFocused] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const areas = useRef<Array<HTMLTextAreaElement | null>>([])
  const counter = useRef(0)
  const dirty = plain(items) !== saved

  const update = (index: number, patch: Partial<Snippet>) => setItems((list) => list.map((item, position) => (position === index ? { ...item, ...patch } : item)))
  const move = (index: number, step: number) =>
    setItems((list) => {
      const target = index + step
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const insert = (token: string) => {
    const index = focused ?? items.length - 1
    const area = areas.current[index]
    const item = items[index]
    if (!item) return
    const start = area?.selectionStart ?? item.body.length
    const end = area?.selectionEnd ?? item.body.length
    const body = `${item.body.slice(0, start)}${token}${item.body.slice(end)}`.slice(0, 1000)
    update(index, { body })
    requestAnimationFrame(() => {
      const element = areas.current[index]
      if (!element) return
      element.focus()
      element.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const save = () =>
    startTransition(async () => {
      setNotice(null)
      const result = await saveSnippetsAction(items.map(({ id, title, body }) => ({ id, title, body })))
      setNotice({ ok: result.ok, message: result.message })
      if (result.ok && result.items) {
        const next = result.items.length ? result.items : defaults
        setItems(rows(next))
        setSaved(plain(next))
        router.refresh()
      }
    })

  return (
    <section id="hazir-yanitlar" className="card scroll-mt-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-ink">Hazır yanıtlar</h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">WhatsApp sohbetinde Hazır yanıtlar düğmesiyle ya da boş kutuya / yazarak eklenir. Süslü parantezli alanlar her kişi için kendiliğinden dolar; boş kalan alan metinden çıkarılır.</p>
        </div>
        <span className="pill">
          {items.length} / {MAX_ITEMS}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Değişkenler">
        {variables.map((variable) => (
          <button key={variable.token} type="button" className="chip" onClick={() => insert(variable.token)} title={`${variable.label} ekle`} disabled={!items.length}>
            <span className="text-ink">{variable.token}</span>
            {variable.label}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {items.map((item, index) => (
          <li key={item.key} className={'rounded-2xl border p-4 transition ' + (focused === index ? 'border-accent-strong' : 'border-line')}>
            <div className="flex items-center gap-2">
              <input className="input py-2 text-sm" value={item.title} maxLength={40} placeholder="Başlık, örnek: Görüşme saati iste" onChange={(event) => update(index, { title: event.target.value })} onFocus={() => setFocused(index)} aria-label={`${index + 1}. yanıtın başlığı`} />
              <button type="button" className="chip" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Yukarı taşı">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="chip" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label="Aşağı taşı">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="chip" onClick={() => setItems((list) => list.filter((_, position) => position !== index))} aria-label="Sil">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <textarea
              ref={(element) => {
                areas.current[index] = element
              }}
              className="textarea mt-2 min-h-24"
              value={item.body}
              maxLength={1000}
              placeholder="Merhaba {ad}, ..."
              onChange={(event) => update(index, { body: event.target.value })}
              onFocus={() => setFocused(index)}
              aria-label={`${index + 1}. yanıtın metni`}
            />
            <div className="mt-1 text-right text-[11px] text-mute">{item.body.length}/1000</div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-mute">Liste boş. Boş kaydederseniz varsayılan yanıtlar kullanılır.</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={items.length >= MAX_ITEMS}
          onClick={() => {
            counter.current += 1
            setItems((list) => [...list, { id: '', title: '', body: '', key: `yeni-${counter.current}` }])
            setFocused(items.length)
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Yeni yanıt
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setItems(rows(defaults))}>
          <RotateCcw className="h-3.5 w-3.5" /> Varsayılanlar
        </button>
        <MotionButton small disabled={pending || !dirty} onClick={save}>
          {pending ? 'Kaydediliyor' : 'Kaydet'}
        </MotionButton>
        {notice ? (
          <span className={`text-sm ${notice.ok ? 'text-ink' : 'text-mute'}`} role="status">
            {notice.message}
          </span>
        ) : dirty ? (
          <span className="text-xs text-mute">Kaydedilmemiş değişiklik var</span>
        ) : null}
      </div>
    </section>
  )
}
