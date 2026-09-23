'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'

type NoteAction = (state: { ok: boolean; message: string } | null, formData: FormData) => Promise<{ ok: boolean; message: string }>

export function NoteForm({ action, language, intent, placeholder, title, submit, contactPlaceholder }: { action: NoteAction; language: 'tr' | 'en'; intent: 'meeting' | 'info' | 'later' | 'other'; placeholder: string; title: string; submit: string; contactPlaceholder: string }) {
  const [state, formAction] = useActionState(action, null)
  if (state?.ok) {
    return (
      <div className="flex flex-col justify-center rounded-3xl border border-accent bg-accent-soft p-6">
        <div className="text-lg text-ink">{state.message}</div>
      </div>
    )
  }
  return (
    <form action={formAction} className="space-y-3">
      <div className="text-sm text-ink">{title}</div>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="lang" value={language} />
      <textarea name="note" required minLength={2} maxLength={2000} rows={4} placeholder={placeholder} className="textarea" />
      <input name="contact" maxLength={160} placeholder={contactPlaceholder} className="input py-2.5 text-sm" />
      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel={language === 'en' ? 'Sending' : 'Gönderiliyor'}>{submit}</SubmitButton>
        {state && !state.ok ? <span className="text-xs text-mute">{state.message}</span> : null}
      </div>
    </form>
  )
}
