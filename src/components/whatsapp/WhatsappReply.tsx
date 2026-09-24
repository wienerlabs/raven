'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { replyWhatsappAction } from '@/app/actions/whatsapp'
import { MotionButton } from '@/components/ui/MotionButton'

export function WhatsappReply({ contactId, windowOpen, closesAt, placeholder }: { contactId: string; windowOpen: boolean; closesAt: string | null; placeholder: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!windowOpen) {
    return <p className="text-xs text-mute">WhatsApp yanıt penceresi kapandı. Kişi yeniden yazana kadar yalnızca onaylı şablonla ulaşılabilir.</p>
  }

  const closes = closesAt ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(closesAt)) : null

  return (
    <div className="space-y-2">
      <textarea className="textarea min-h-20" value={text} placeholder={placeholder} maxLength={4000} onChange={(event) => setText(event.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-mute">{closes ? `Serbest yanıt ${closes} saatine kadar açık` : ''}</span>
        <MotionButton
          small
          disabled={pending || text.trim().length < 2}
          onClick={() =>
            startTransition(async () => {
              const result = await replyWhatsappAction(contactId, text)
              setNotice(result.message)
              if (result.ok) {
                setText('')
                router.refresh()
              }
            })
          }
        >
          <Send className="h-3.5 w-3.5" /> WhatsApp&apos;tan gönder
        </MotionButton>
      </div>
      {notice ? (
        <p className="text-xs text-ink" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
