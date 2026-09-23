'use client'

import { useActionState, useState } from 'react'
import { FileUp } from 'lucide-react'
import type { ActionResult } from '@/app/actions/contacts'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface Props {
  action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>
  title: string
  body: string
  accept: string
  submit: string
  approveOption?: boolean
}

export function UploadForm({ action, title, body, accept, submit, approveOption = false }: Props) {
  const [state, formAction] = useActionState(action, null)
  const [name, setName] = useState<string | null>(null)
  return (
    <form action={formAction} className="card flex flex-col">
      <h2 className="text-lg text-ink">{title}</h2>
      <p className="mt-1 text-sm text-mute">{body}</p>
      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line px-6 py-10 text-center transition hover:border-accent-strong hover:bg-accent-soft">
        <FileUp className="h-5 w-5 text-mute" />
        <span className="text-sm text-ink">{name ?? 'Dosya seçin veya buraya bırakın'}</span>
        <span className="text-xs text-mute">{accept.replace(/,/g, ', ')}</span>
        <input type="file" name="file" accept={accept} required className="sr-only" onChange={(event) => setName(event.target.files?.[0]?.name ?? null)} />
      </label>
      {approveOption ? (
        <label className="mt-4 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="approveClean" className="accent-[var(--color-accent-strong)]" />
          Uyarısız içerikleri otomatik onayla
        </label>
      ) : null}
      <div className="mt-4 flex items-center gap-3">
        <SubmitButton small pendingLabel="Yükleniyor">
          {submit}
        </SubmitButton>
      </div>
      {state ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-ink">{state.message}</p>
          {state.errors?.length ? (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs text-mute">
              {state.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
