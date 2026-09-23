'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function UnsubscribeForm({ action, confirm, done }: { action: () => Promise<{ ok: boolean }>; confirm: string; done: string }) {
  const [state, formAction] = useActionState(async () => action(), null)
  if (state?.ok) return <p className="mt-6 rounded-2xl border border-accent bg-accent-soft p-4 text-sm text-ink">{done}</p>
  return (
    <form action={formAction} className="mt-6">
      <SubmitButton pendingLabel="...">{confirm}</SubmitButton>
    </form>
  )
}
