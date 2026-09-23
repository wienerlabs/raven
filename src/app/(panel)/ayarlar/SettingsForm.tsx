'use client'

import { useActionState } from 'react'
import type { ActionResult } from '@/app/actions/contacts'
import type { AppSettings } from '@/lib/settings'
import { SubmitButton } from '@/components/ui/SubmitButton'

function Input({ name, label, value, placeholder, type = 'text', hint }: { name: string; label: string; value: string; placeholder?: string; type?: string; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} type={type} defaultValue={value} placeholder={placeholder} className="input py-2.5 text-sm" />
      {hint ? <p className="mt-1 text-[11px] text-mute">{hint}</p> : null}
    </div>
  )
}

export function SettingsForm({ action, settings }: { action: (state: ActionResult | null, formData: FormData) => Promise<ActionResult>; settings: AppSettings }) {
  const [state, formAction] = useActionState(action, null)
  return (
    <form action={formAction} className="space-y-6">
      <section className="card space-y-4">
        <div>
          <h2 className="text-lg text-ink">Gönderen kimliği</h2>
          <p className="mt-1 text-sm text-mute">E-posta imzasında ve WhatsApp mesajlarında görünür.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input name="sender.fullName" label="Ad soyad" value={settings.sender.fullName} />
          <Input name="sender.firstName" label="Mesajlarda kullanılan ad" value={settings.sender.firstName} />
          <Input name="sender.title" label="Ünvan" value={settings.sender.title} />
          <Input name="sender.company" label="Şirket" value={settings.sender.company} />
          <Input name="sender.phone" label="Telefon" value={settings.sender.phone} placeholder="+90 5xx xxx xx xx" />
          <Input name="sender.website" label="Web sitesi" value={settings.sender.website} placeholder="https://wienerlabs.xyz" />
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg text-ink">Teklif ve dönüş</h2>
          <p className="mt-1 text-sm text-mute">AI, her kişiye çözüm tasarlarken bu metni Wiener Labs&apos;in ne yaptığı olarak kullanır.</p>
        </div>
        <div>
          <label className="label" htmlFor="offer">
            Teklif metni
          </label>
          <textarea id="offer" name="offer" defaultValue={settings.offer} rows={5} className="textarea" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="calendarUrl" label="Görüşme takvimi bağlantısı" value={settings.calendarUrl} placeholder="https://cal.com/wienerlabs/20dk" hint="Görüşme isteyen kişiye taslak sayfasında gösterilir." />
          <Input name="notifyEmail" label="Yanıt bildirimi e-postası" value={settings.notifyEmail} type="email" placeholder="ekip@wienerlabs.xyz" hint="Her yeni yanıtta bu adrese kısa bir bildirim gider." />
        </div>
      </section>

      <section id="hukuki" className="card space-y-4">
        <div>
          <h2 className="text-lg text-ink">Hukuki bilgiler ve aydınlatma</h2>
          <p className="mt-1 text-sm text-mute">Her e-postanın altında gönderen kimliği, verilerin kaynağı, aydınlatma metni ve tek tıkla çıkış bağlantısı yer alır.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="legal.companyName" label="Şirket unvanı" value={settings.legal.companyName} />
          <Input name="legal.mersis" label="MERSİS numarası (isteğe bağlı)" value={settings.legal.mersis} />
          <Input name="legal.address" label="Adres" value={settings.legal.address} />
          <Input name="legal.contactEmail" label="KVKK başvuru e-postası" value={settings.legal.contactEmail} type="email" />
          <Input name="partnerName" label="Verileri sağlayan iş ortağının adı (isteğe bağlı)" value={settings.partnerName} hint="Boş bırakılırsa e-postada yalnızca 'iş ortağımız' yazar." />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="tracking.opens" defaultChecked={settings.tracking.opens} className="accent-[var(--color-accent-strong)]" />
          E-posta açılma takibi (görünmez piksel). Teslim oranını korumak için kapalı tutulması önerilir; tıklama ve yanıtlar her durumda ölçülür.
        </label>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Kaydediliyor">Ayarları kaydet</SubmitButton>
        {state ? <span className="text-sm text-mute">{state.message}</span> : null}
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
