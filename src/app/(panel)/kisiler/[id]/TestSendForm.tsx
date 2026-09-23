'use client'

import { useActionState, useEffect, useState } from 'react'
import type { ActionResult } from '@/app/actions/contacts'
import { SubmitButton } from '@/components/ui/SubmitButton'

const KEY = 'raven.testRecipient'

export function TestSendForm({ action }: { action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult> }) {
  const [state, formAction] = useActionState(action, null)
  const [recipient, setRecipient] = useState('')
  useEffect(() => {
    try {
      setRecipient(localStorage.getItem(KEY) ?? '')
    } catch {
      setRecipient('')
    }
  }, [])
  return (
    <form
      action={formAction}
      className="card"
      onSubmit={() => {
        try {
          localStorage.setItem(KEY, recipient)
        } catch {
          return
        }
      }}
    >
      <h3 className="text-lg text-ink">Kendinize test gönderin</h3>
      <p className="mt-1 text-sm text-mute">E-posta, gerçek gönderim altyapısıyla ve konu başında &quot;Test&quot; ile gelir. Kişinin aşaması değişmez.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input name="recipient" type="email" required placeholder="siz@wienerlabs.xyz" className="input py-2.5 text-sm" value={recipient} onChange={(event) => setRecipient(event.target.value)} />
        <select name="step" className="select" defaultValue="0" aria-label="Hangi e-posta">
          <option value="0">İlk e-posta</option>
          <option value="1">Takip 1</option>
          <option value="2">Takip 2</option>
        </select>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <SubmitButton small pendingLabel="Gönderiliyor">
          Test gönder
        </SubmitButton>
        {state ? <span className="text-xs text-mute">{state.message}</span> : null}
      </div>
    </form>
  )
}
