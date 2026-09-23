'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/app/actions/contacts'
import type { CampaignConfig } from '@/lib/db/schema'
import { SubmitButton } from '@/components/ui/SubmitButton'

function NumberField({ name, label, value, min, max, suffix }: { name: string; label: string; value: number; min: number; max: number; suffix?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input id={name} name={name} type="number" min={min} max={max} defaultValue={value} className="input py-2.5 text-sm" required />
        {suffix ? <span className="shrink-0 text-xs text-mute">{suffix}</span> : null}
      </div>
    </div>
  )
}

export function ConfigForm({ action, config }: { action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>; config: CampaignConfig }) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className="card space-y-5">
      <div>
        <h2 className="text-lg text-ink">Gönderim kuralları</h2>
        <p className="mt-1 text-sm text-mute">Yeni domainler için günde 30 ile 60, ısınmış kutular için en fazla 100 e-posta önerilir. Aralıklar rastgele seçilir, böylece gönderimler insan ritminde ilerler.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NumberField name="windowStartHour" label="Başlangıç saati" value={config.windowStartHour} min={0} max={23} suffix=":00" />
        <NumberField name="windowEndHour" label="Bitiş saati" value={config.windowEndHour} min={1} max={24} suffix=":00" />
        <NumberField name="dailyLimitPerSender" label="Gönderen başına günlük limit" value={config.dailyLimitPerSender} min={1} max={2000} />
        <NumberField name="minGapSeconds" label="En kısa aralık" value={config.minGapSeconds} min={20} max={3600} suffix="sn" />
        <NumberField name="maxGapSeconds" label="En uzun aralık" value={config.maxGapSeconds} min={20} max={7200} suffix="sn" />
        <NumberField name="followUpDay1" label="Takip 1, ilk e-postadan sonra" value={config.followUpDays[0] ?? 3} min={1} max={30} suffix="iş günü" />
        <NumberField name="followUpDay2" label="Takip 2, takip 1'den sonra" value={config.followUpDays[1] ?? 4} min={1} max={30} suffix="iş günü" />
      </div>
      <div className="flex flex-wrap gap-5 text-sm text-ink">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="followUpsEnabled" defaultChecked={config.followUpsEnabled} className="accent-[var(--color-accent-strong)]" />
          Yanıt gelmezse takip e-postaları gönder
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="subjectTest" defaultChecked={config.subjectTest} className="accent-[var(--color-accent-strong)]" />
          Konu satırında A/B testi yap
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="weekend" defaultChecked={config.weekdays.length === 7} className="accent-[var(--color-accent-strong)]" />
          Hafta sonu da gönder
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton small variant="ghost" pendingLabel="Kaydediliyor">
          Kuralları kaydet
        </SubmitButton>
        {state ? <span className="text-xs text-mute">{state.message}</span> : null}
      </div>
    </form>
  )
}
