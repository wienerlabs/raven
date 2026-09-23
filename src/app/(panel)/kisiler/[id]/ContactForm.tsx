'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/app/actions/contacts'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface ContactValues {
  firstName: string
  lastName: string
  title: string
  company: string
  email: string
  phone: string
  relationship: 'prospect' | 'customer'
  notes: string
  whatsappOptIn: boolean
}

export function ContactForm({ action, contact }: { action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>; contact: ContactValues }) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className="card space-y-3">
      <h3 className="text-lg text-ink">Kişi bilgileri</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstName">
            Ad
          </label>
          <input id="firstName" name="firstName" defaultValue={contact.firstName} className="input py-2.5 text-sm" required />
        </div>
        <div>
          <label className="label" htmlFor="lastName">
            Soyad
          </label>
          <input id="lastName" name="lastName" defaultValue={contact.lastName} className="input py-2.5 text-sm" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="title">
          Ünvan
        </label>
        <input id="title" name="title" defaultValue={contact.title} className="input py-2.5 text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="company">
          Şirket
        </label>
        <input id="company" name="company" defaultValue={contact.company} className="input py-2.5 text-sm" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">
            E-posta
          </label>
          <input id="email" name="email" type="email" defaultValue={contact.email} className="input py-2.5 text-sm" />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Telefon (WhatsApp)
          </label>
          <input id="phone" name="phone" defaultValue={contact.phone} placeholder="+90 5xx xxx xx xx" className="input py-2.5 text-sm" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="relationship">
            İlişki
          </label>
          <select id="relationship" name="relationship" defaultValue={contact.relationship} className="select">
            <option value="prospect">Aday müşteri</option>
            <option value="customer">Mevcut müşteri</option>
          </select>
        </div>
        <label className="mt-6 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="whatsappOptIn" defaultChecked={contact.whatsappOptIn} className="accent-[var(--color-accent-strong)]" />
          WhatsApp izni var
        </label>
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Ekip notu (AI üretiminde bağlam olarak kullanılır)
        </label>
        <textarea id="notes" name="notes" defaultValue={contact.notes} rows={3} className="textarea" />
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton small variant="ghost" pendingLabel="Kaydediliyor">
          Kaydet
        </SubmitButton>
        {state ? <span className="text-xs text-mute">{state.message}</span> : null}
      </div>
      {state?.errors?.length ? (
        <ul className="space-y-0.5 text-xs text-mute">
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}
