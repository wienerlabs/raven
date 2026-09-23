'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { markHandled } from '@/app/actions/data'
import { MotionButton } from '@/components/ui/MotionButton'

export function HandledButton({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <MotionButton
      variant="ghost"
      small
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markHandled(id, !handled)
          router.refresh()
        })
      }
    >
      <Check className="h-3.5 w-3.5" /> {handled ? 'Tekrar aç' : 'İlgilenildi'}
    </MotionButton>
  )
}
