'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { refreshWhatsappTemplates, saveWhatsappAction, sendWhatsappTest, submitWhatsappTemplates, testWhatsappConnection } from '@/app/actions/whatsapp'
import type { SetupKey } from '@/lib/whatsapp/config'
import { MotionButton } from '@/components/ui/MotionButton'

export interface SetupProps {
  businessNumberLabel: string | null
  initial: { businessNumber: string; autoSend: boolean; phoneNumberId: string; wabaId: string; templateName: string }
  hasToken: boolean
  hasAppSecret: boolean
  cloudReady: boolean
  mode: 'cloud' | 'manual'
  webhookUrl: string
  verifyToken: string
  webhookVerifiedAt: string | null
  templates: Array<{ language: string; status: string; reason: string | null }>
  templatesCheckedAt: string | null
  templateTexts: Array<{ language: string; body: string; footer: string; button: string; url: string }>
  steps: Array<{ key: SetupKey; done: boolean }>
}

type Result = { ok: boolean; message: string }

const statusLabels: Record<string, string> = { APPROVED: 'Onaylandı', PENDING: 'İncelemede', REJECTED: 'Reddedildi', PAUSED: 'Duraklatıldı', DISABLED: 'Devre dışı' }

function when(value: string | null): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(value))
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-soft px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 break-all text-ink">{value || 'Kaydettiğinizde oluşur'}</span>
        {value ? (
          <button
            type="button"
            className="chip shrink-0"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Capability({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (on ? 'bg-accent-strong' : 'bg-line')} aria-hidden />
      <span>
        <span className="block text-sm text-ink">
          {label} <span className="text-xs text-mute">{on ? 'açık' : 'kapalı'}</span>
        </span>
        <span className="block text-xs text-mute">{detail}</span>
      </span>
    </li>
  )
}

export function WhatsappSetup(props: SetupProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ ...props.initial, token: '', appSecret: '', clearToken: false, clearAppSecret: false })
  const [testNumber, setTestNumber] = useState('')
  const [notice, setNotice] = useState<(Result & { step: SetupKey }) | null>(null)
  const [openKey, setOpenKey] = useState<SetupKey | null>(props.steps.find((step) => !step.done)?.key ?? null)
  const approved = props.templates.filter((item) => item.status === 'APPROVED').map((item) => item.language)
  const done = Object.fromEntries(props.steps.map((step) => [step.key, step.done])) as Record<SetupKey, boolean>
  const receiving = Boolean(props.webhookVerifiedAt) && props.hasAppSecret

  const run = (step: SetupKey, task: () => Promise<Result>) =>
    startTransition(async () => {
      setNotice(null)
      const result = await task()
      setNotice({ ...result, step })
      if (result.ok) setForm((current) => ({ ...current, token: '', appSecret: '', clearToken: false, clearAppSecret: false }))
      router.refresh()
    })

  const save = (step: SetupKey) => run(step, () => saveWhatsappAction(form))

  const field = (key: 'businessNumber' | 'phoneNumberId' | 'wabaId' | 'templateName', label: string, hint: string, placeholder = '') => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input py-2.5 text-sm" value={form[key]} placeholder={placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
      <span className="mt-1 block text-xs text-mute">{hint}</span>
    </label>
  )

  const secret = (key: 'token' | 'appSecret', clearKey: 'clearToken' | 'clearAppSecret', label: string, stored: boolean, placeholder: string, hint: string) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input py-2.5 text-sm" type="password" autoComplete="off" value={form[key]} placeholder={stored ? 'Kayıtlı, değiştirmek için yenisini girin' : placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
      {stored ? (
        <span className="mt-1 flex items-center gap-2 text-xs text-mute">
          <input type="checkbox" checked={form[clearKey]} onChange={(event) => setForm((current) => ({ ...current, [clearKey]: event.target.checked }))} className="accent-[var(--color-accent-strong)]" /> Kayıtlı anahtarı sil
        </span>
      ) : (
        <span className="mt-1 block text-xs text-mute">{hint}</span>
      )}
    </label>
  )

  const status = (step: SetupKey) =>
    notice && notice.step === step ? (
      <p className={`text-sm ${notice.ok ? 'text-ink' : 'text-mute'}`} role="status">
        {notice.message}
      </p>
    ) : null

  const steps: Array<{ key: SetupKey; title: string; summary: string; optional?: boolean; body: ReactNode }> = [
    {
      key: 'number',
      title: 'İş numarası',
      summary: props.businessNumberLabel ? `${props.businessNumberLabel} üzerinden yazışılır` : 'Alıcıların yazacağı WhatsApp Business numarası',
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">Kaydettiğiniz anda e-postalara ve kişisel taslak sayfalarına &quot;WhatsApp&apos;tan yazın&quot; düğmesi eklenir. Yazan kişi mesajdaki referans koduyla tanınır.</p>
          <div className="max-w-sm">{field('businessNumber', 'İş numarası', 'Örnek: +90 532 000 00 00', '+90 5XX XXX XX XX')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending} onClick={() => save('number')}>
              Kaydet
            </MotionButton>
            {status('number')}
          </div>
        </div>
      ),
    },
    {
      key: 'cloud',
      title: 'Cloud API bağlantısı',
      summary: props.cloudReady ? 'Erişim anahtarı ve telefon numarası kimliği kayıtlı' : 'Panelden yanıt ve şablon gönderimi için gerekli',
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">Meta Business, WhatsApp, API Kurulumu sayfasındaki değerleri girin. Kalıcı erişim anahtarı için Business Ayarları altında bir sistem kullanıcısı oluşturun.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {field('phoneNumberId', 'Telefon numarası kimliği', 'API Kurulumu sayfasında yazar')}
            {field('wabaId', 'WhatsApp Business hesap kimliği', 'Şablon oluşturmak ve durumunu görmek için')}
            {secret('token', 'clearToken', 'Erişim anahtarı', props.hasToken, 'Kalıcı sistem kullanıcısı anahtarı', 'Şifrelenerek saklanır, bir daha gösterilmez')}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending} onClick={() => save('cloud')}>
              Kaydet
            </MotionButton>
            <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run('cloud', testWhatsappConnection)}>
              Bağlantıyı test et
            </MotionButton>
            {status('cloud')}
          </div>
        </div>
      ),
    },
    {
      key: 'webhook',
      title: 'Gelen mesajlar',
      summary: receiving
        ? `Meta ${when(props.webhookVerifiedAt)} tarihinde doğruladı, imza kontrol ediliyor`
        : props.webhookVerifiedAt
          ? 'Doğrulandı, uygulama gizli anahtarı eksik'
          : props.hasAppSecret
            ? 'Meta doğrulaması bekleniyor'
            : "Mesajların Raven'a düşmesi için webhook ve imza anahtarı",
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">Meta uygulamanızda WhatsApp, Yapılandırma, Webhook bölümüne bu iki değeri girin ve messages alanına abone olun. Uygulama gizli anahtarı gelen her mesajın gerçekten Meta&apos;dan geldiğini doğrular; o olmadan mesaj kabul edilmez.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <CopyField label="Webhook adresi (Callback URL)" value={props.webhookUrl} />
            <CopyField label="Doğrulama anahtarı (Verify token)" value={props.verifyToken} />
          </div>
          <div className="max-w-md">{secret('appSecret', 'clearAppSecret', 'Uygulama gizli anahtarı', props.hasAppSecret, 'Meta uygulamasının App Secret değeri', 'Şifrelenerek saklanır, bir daha gösterilmez')}</div>
          <p className="text-xs text-mute">{props.webhookVerifiedAt ? `Meta webhook adresini ${when(props.webhookVerifiedAt)} tarihinde doğruladı.` : 'Meta panelinde Doğrula ve kaydet düğmesine bastığınızda doğrulama burada kendiliğinden görünür.'}</p>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending} onClick={() => save('webhook')}>
              Kaydet
            </MotionButton>
            {status('webhook')}
          </div>
        </div>
      ),
    },
    {
      key: 'template',
      title: 'Tanıtım şablonu',
      summary: approved.length ? `Onaylı dil: ${approved.join(', ')}` : props.templates.length ? props.templates.map((item) => `${item.language}: ${statusLabels[item.status] ?? item.status}`).join(', ') : 'İlk mesaj için Meta onaylı şablon gerekir',
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">WhatsApp, işletmenin ilk mesajını yalnızca onaylı şablonla kabul eder. Şablonu buradan Meta&apos;ya gönderin; onay genelde birkaç dakika ile birkaç saat sürer.</p>
          <div className="max-w-sm">{field('templateName', 'Şablon adı', 'Küçük harf ve alt çizgi, örnek: raven_intro')}</div>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending} onClick={() => save('template')}>
              Kaydet
            </MotionButton>
            <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run('template', submitWhatsappTemplates)}>
              Şablonu Meta&apos;ya gönder
            </MotionButton>
            <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run('template', refreshWhatsappTemplates)}>
              Durumu yenile
            </MotionButton>
            {status('template')}
          </div>
          {props.templates.length ? (
            <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
              {props.templates.map((item) => (
                <li key={item.language} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-ink">
                    {props.initial.templateName} · {item.language}
                  </span>
                  <span className="text-xs text-mute">
                    {statusLabels[item.status] ?? item.status}
                    {item.reason ? ` (${item.reason})` : ''}
                  </span>
                </li>
              ))}
              {props.templatesCheckedAt ? <li className="px-4 py-2 text-xs text-mute">Son kontrol {when(props.templatesCheckedAt)}</li> : null}
            </ul>
          ) : null}
          <details className="rounded-2xl border border-line p-4">
            <summary className="cursor-pointer text-sm text-ink">Şablon metinleri</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {props.templateTexts.map((item) => (
                <div key={item.language} className="rounded-2xl bg-soft p-4 text-xs leading-5 text-body">
                  <div className="text-mute">{item.language === 'tr' ? 'Türkçe' : 'İngilizce'} · Pazarlama</div>
                  <p className="mt-2 text-ink">{item.body}</p>
                  <p className="mt-2 text-mute">{item.footer}</p>
                  <p className="mt-2">
                    Düğme: {item.button}, <span className="break-all">{item.url}</span>
                  </p>
                </div>
              ))}
            </div>
          </details>
        </div>
      ),
    },
    {
      key: 'auto',
      title: 'Otomatik gönderim ve test',
      optional: true,
      summary: props.mode === 'cloud' ? 'İzin vermiş kişilere mesai saatinde otomatik gider' : 'Kapalı: ilk mesajlar elle gönderim kuyruğunda bekler',
      body: (
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-2xl border border-line p-3 text-sm">
            <input type="checkbox" className="mt-1 accent-[var(--color-accent-strong)]" checked={form.autoSend} onChange={(event) => setForm((current) => ({ ...current, autoSend: event.target.checked }))} />
            <span>
              <span className="block text-ink">Otomatik gönderim</span>
              <span className="block text-xs text-mute">Kampanyada e-postası olmayan ve WhatsApp izni bulunan kişilere onaylı şablon mesai saatinde otomatik gider. İzni olmayanlar elle gönderim kuyruğunda kalır.</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending} onClick={() => save('auto')}>
              Kaydet
            </MotionButton>
            {status('auto')}
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <label className="block min-w-[14rem] flex-1">
              <span className="label">Test mesajı</span>
              <input className="input py-2.5 text-sm" placeholder="+90 5XX XXX XX XX" value={testNumber} onChange={(event) => setTestNumber(event.target.value)} />
            </label>
            <MotionButton small variant="ghost" disabled={pending || !props.cloudReady || !testNumber.trim()} onClick={() => run('auto', () => sendWhatsappTest(testNumber))}>
              Şablonu bu numaraya gönder
            </MotionButton>
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <ol className="space-y-3">
        {steps.map((step, index) => {
          const open = openKey === step.key
          const complete = done[step.key]
          return (
            <li key={step.key} className={'rounded-3xl border bg-surface transition ' + (open ? 'border-accent-strong' : 'border-line')}>
              <button type="button" onClick={() => setOpenKey(open ? null : step.key)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left">
                <span className={'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ' + (complete ? 'border-accent bg-accent text-on-accent' : 'border-line bg-canvas text-mute')}>
                  {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">{step.title}</span>
                  <span className="block truncate text-xs text-mute">{step.summary}</span>
                </span>
                {step.optional ? <span className="pill hidden sm:inline-flex">İsteğe bağlı</span> : null}
                <ChevronDown className={'h-4 w-4 shrink-0 text-mute transition ' + (open ? 'rotate-180' : '')} />
              </button>
              {open ? <div className="border-t border-line px-5 pb-5 pt-4">{step.body}</div> : null}
            </li>
          )
        })}
      </ol>
      <aside className="space-y-4">
        <div className="card">
          <h2 className="text-sm text-ink">Şu an çalışanlar</h2>
          <ul className="mt-4 space-y-3">
            <Capability on={Boolean(props.businessNumberLabel)} label="Tıkla yaz düğmesi" detail="E-postalarda ve taslak sayfalarında" />
            <Capability on={receiving} label="Gelen mesajlar" detail="Sohbetler sekmesine düşer, yazan kişi tanınır" />
            <Capability on={props.cloudReady} label="Panelden yanıt" detail="24 saatlik pencerede serbest metin" />
            <Capability on={props.mode === 'cloud'} label="Otomatik ilk mesaj" detail="Onaylı şablonla, izinli kişilere" />
          </ul>
        </div>
        <div className="card text-xs leading-5 text-mute">
          Anahtarlar veritabanında şifrelenmiş olarak tutulur ve bir daha gösterilmez. Cloud API olmadan da çalışırsınız: yanıtlar kendi WhatsApp&apos;ınızda açılır, gönderdiğinizi sohbete kaydedersiniz.
        </div>
      </aside>
    </div>
  )
}
