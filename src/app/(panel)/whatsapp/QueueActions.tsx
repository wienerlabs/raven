'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelWhatsapp, markWhatsappSent, queueWhatsapp } from '@/app/actions/data'
import { MotionButton } from '@/components/ui/MotionButton'

export function QueueActions({ messageId, link }: { messageId: string; link: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [opened, setOpened] = useState(false)
  const act = (task: () => Promise<unknown>) =>
    startTransition(async () => {
      await task()
      router.refresh()
    })
  return (
    <div className="flex flex-wrap gap-2">
      {link ? (
        <a href={link} target="_blank" rel="noreferrer" className="btn btn-sm" onClick={() => setOpened(true)}>
          WhatsApp&apos;ta aç
        </a>
      ) : null}
      <MotionButton variant={opened ? 'primary' : 'ghost'} small disabled={pending} onClick={() => act(() => markWhatsappSent(messageId))}>
        Gönderildi
      </MotionButton>
      <MotionButton variant="ghost" small disabled={pending} onClick={() => act(() => cancelWhatsapp(messageId))}>
        Kuyruktan çıkar
      </MotionButton>
    </div>
  )
}

export function AddToQueue({ contacts }: { contacts: Array<{ id: string; name: string; company: string; phone: string }> }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="mt-4 space-y-3">
      <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-2xl border border-line">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--color-accent-strong)]"
                checked={selected.has(contact.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current)
                    if (next.has(contact.id)) next.delete(contact.id)
                    else next.add(contact.id)
                    return next
                  })
                }
              />
              <span className="text-ink">{contact.name}</span>
              <span className="text-mute">{contact.company}</span>
              <span className="ml-auto text-xs text-mute">{contact.phone}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <MotionButton
          small
          disabled={pending || selected.size === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await queueWhatsapp([...selected])
              setMessage(result.message)
              setSelected(new Set())
              router.refresh()
            })
          }
        >
          Seçilenleri kuyruğa ekle
        </MotionButton>
        {message ? <span className="text-xs text-mute">{message}</span> : null}
      </div>
    </div>
  )
}
