'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { linkWhatsappNumberAction } from '@/app/actions/whatsapp'
import { MotionButton } from '@/components/ui/MotionButton'

export function LinkNumberButton({ contactId }: { contactId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <MotionButton
        small
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await linkWhatsappNumberAction(contactId)
            setNotice(result.message)
            if (result.ok) router.refresh()
          })
        }
      >
        <Link2 className="h-3.5 w-3.5" /> Numarayı kişiye bağla
      </MotionButton>
      {notice ? (
        <span className="text-xs text-mute" role="status">
          {notice}
        </span>
      ) : null}
    </span>
  )
}
