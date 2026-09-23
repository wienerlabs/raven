'use client'

import { useActionState, useState } from 'react'
import type { ActionResult } from '@/app/actions/contacts'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { Pitch } from '@/lib/pitch/schema'

type Action = (state: ActionResult | null, formData: FormData) => Promise<ActionResult>

function Field({ name, label, value, rows = 1, hint }: { name: string; label: string; value: string; rows?: number; hint?: string }) {
  const [length, setLength] = useState(value.length)
  return (
    <div>
      <label className="label flex justify-between" htmlFor={name}>
        <span>{label}</span>
        <span>{hint ? `${hint} · ` : ''}{length} karakter</span>
      </label>
      {rows > 1 ? (
        <textarea id={name} name={name} defaultValue={value} rows={rows} className="textarea" onChange={(event) => setLength(event.target.value.length)} />
      ) : (
        <input id={name} name={name} defaultValue={value} className="input py-2.5 text-sm" onChange={(event) => setLength(event.target.value.length)} />
      )}
    </div>
  )
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null
  return (
    <div className="space-y-1 text-xs">
      <p className={state.ok ? 'text-ink' : 'text-ink'}>{state.message}</p>
      {state.errors?.length ? (
        <ul className="space-y-0.5 text-mute">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function PitchEditor({ action, jsonAction, pitch }: { action: Action; jsonAction: Action; pitch: Pitch }) {
  const [state, formAction] = useActionState(action, null)
  const [jsonState, jsonFormAction] = useActionState(jsonAction, null)
  const [advanced, setAdvanced] = useState(false)
  return (
    <div className="card space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg text-ink">İçeriği düzenle</h3>
          <p className="mt-1 text-sm text-mute">Kaydettiğinizde kalite kontrolü yeniden çalışır. Em dash, ünlem, spam kelimeleri ve bağlantılar kabul edilmez.</p>
        </div>
        <button type="button" className="chip" onClick={() => setAdvanced((value) => !value)}>
          {advanced ? 'Alanlar' : 'Gelişmiş (JSON)'}
        </button>
      </div>
      {advanced ? (
        <form action={jsonFormAction} className="space-y-3">
          <textarea name="json" defaultValue={JSON.stringify(pitch, null, 2)} rows={28} className="textarea font-mono text-xs" spellCheck={false} />
          <div className="flex items-center gap-3">
            <SubmitButton small pendingLabel="Kaydediliyor">
              JSON'u kaydet
            </SubmitButton>
          </div>
          <Feedback state={jsonState} />
        </form>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="email.subject" label="Konu A" value={pitch.email.subject} hint="en fazla 64" />
            <Field name="email.subjectAlt" label="Konu B" value={pitch.email.subjectAlt} hint="en fazla 64" />
          </div>
          <Field name="email.preheader" label="Önizleme metni" value={pitch.email.preheader} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="person.salutation" label="Hitap" value={pitch.person.salutation} />
            <Field name="person.greetingName" label="Hitaptaki isim" value={pitch.person.greetingName} />
          </div>
          <Field name="email.opening" label="Açılış" value={pitch.email.opening} rows={3} />
          <Field name="email.body" label="Gövde (paragrafları boş satırla ayırın)" value={pitch.email.body} rows={7} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="solution.name" label="Çözüm adı" value={pitch.solution.name} />
            <Field name="solution.tagline" label="Çözüm özeti" value={pitch.solution.tagline} />
          </div>
          <Field name="email.cta" label="Çağrı" value={pitch.email.cta} rows={2} />
          <Field name="email.ps" label="Not satırı" value={pitch.email.ps} rows={2} />
          <Field name="followUps.0" label="Takip 1" value={pitch.followUps[0].body} rows={4} />
          <Field name="followUps.1" label="Takip 2" value={pitch.followUps[1].body} rows={4} />
          <Field name="whatsapp" label="WhatsApp ({link} bir kez geçmeli)" value={pitch.whatsapp} rows={4} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name="landing.headline" label="Sayfa başlığı" value={pitch.landing.headline} />
            <Field name="landing.subheadline" label="Sayfa alt başlığı" value={pitch.landing.subheadline} rows={2} />
          </div>
          <div className="flex items-center gap-3">
            <SubmitButton small pendingLabel="Kaydediliyor">
              Kaydet
            </SubmitButton>
          </div>
          <Feedback state={state} />
        </form>
      )}
    </div>
  )
}
