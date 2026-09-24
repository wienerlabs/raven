'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'
import { refreshWhatsappTemplates, saveWhatsappAction, sendWhatsappTest, submitWhatsappTemplates, testWhatsappConnection } from '@/app/actions/whatsapp'
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
}

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

function Step({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ' + (done ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-mute')}>{done ? <Check className="h-3 w-3" /> : null}</span>
      <span>
        <span className="block text-sm text-ink">{title}</span>
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
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null)
  const approved = props.templates.filter((item) => item.status === 'APPROVED').map((item) => item.language)

  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      setNotice(null)
      const result = await task()
      setNotice(result)
      router.refresh()
    })

  const field = (key: 'businessNumber' | 'phoneNumberId' | 'wabaId' | 'templateName', label: string, hint: string, placeholder = '') => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input py-2.5 text-sm" value={form[key]} placeholder={placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
      <span className="mt-1 block text-xs text-mute">{hint}</span>
    </label>
  )

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg text-ink">Kurulum</h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">İş numarasını girdiğiniz anda e-postalarda ve kişisel taslak sayfalarında &quot;WhatsApp&apos;tan yazın&quot; düğmesi çıkar. Yazan kişi numarasıyla birlikte otomatik tanınır ve Yanıtlar kutusuna düşer. Otomatik şablon gönderimi ve panelden yanıt için Meta Cloud API bağlantısı gerekir.</p>
        </div>
        <span className={props.mode === 'cloud' ? 'rounded-full border border-accent bg-accent px-2.5 py-0.5 text-xs text-on-accent' : 'pill'}>{props.mode === 'cloud' ? 'Otomatik gönderim açık' : 'Elle gönderim'}</span>
      </div>

      <ol className="mt-5 grid gap-3 md:grid-cols-2">
        <Step done={Boolean(props.initial.businessNumber)} title="İş numarası" detail={props.businessNumberLabel ? `${props.businessNumberLabel} üzerinden yazışılır` : 'Müşterilerin yazacağı WhatsApp Business numarası'} />
        <Step done={props.cloudReady} title="Cloud API bağlantısı" detail={props.cloudReady ? 'Erişim anahtarı ve telefon numarası kimliği kayıtlı' : 'Meta Business üzerinden kalıcı erişim anahtarı'} />
        <Step done={Boolean(props.webhookVerifiedAt)} title="Webhook doğrulandı" detail={props.webhookVerifiedAt ? `Meta ${when(props.webhookVerifiedAt)} tarihinde doğruladı` : 'Aşağıdaki adres ve doğrulama anahtarı Meta paneline girilir'} />
        <Step done={props.hasAppSecret} title="İmza doğrulaması" detail={props.hasAppSecret ? 'Gelen mesajların Meta imzası kontrol ediliyor' : 'Uygulama gizli anahtarı olmadan gelen mesajlar kabul edilmez'} />
        <Step done={approved.length > 0} title="Mesaj şablonu" detail={approved.length ? `Onaylı dil: ${approved.join(', ')}` : 'İlk mesaj için Meta onaylı şablon gerekir'} />
        <Step done={props.mode === 'cloud'} title="Otomatik gönderim" detail={props.mode === 'cloud' ? 'İzin vermiş kişilere mesai saatinde otomatik gider' : 'Kapalıyken mesajlar tek tıkla elle gönderilir'} />
      </ol>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {field('businessNumber', 'İş numarası', 'Örnek: +90 532 000 00 00', '+90 5XX XXX XX XX')}
        {field('phoneNumberId', 'Telefon numarası kimliği', 'Meta, WhatsApp, API Kurulumu sayfasında yazar')}
        {field('wabaId', 'WhatsApp Business hesap kimliği', 'Şablon oluşturmak ve durumunu görmek için gerekir')}
        {field('templateName', 'Şablon adı', 'Küçük harf ve alt çizgi, örnek: raven_intro')}
        <label className="block">
          <span className="label">Erişim anahtarı</span>
          <input className="input py-2.5 text-sm" type="password" autoComplete="off" value={form.token} placeholder={props.hasToken ? 'Kayıtlı, değiştirmek için yenisini girin' : 'Kalıcı sistem kullanıcısı anahtarı'} onChange={(event) => setForm((current) => ({ ...current, token: event.target.value }))} />
          {props.hasToken ? (
            <span className="mt-1 flex items-center gap-2 text-xs text-mute">
              <input type="checkbox" checked={form.clearToken} onChange={(event) => setForm((current) => ({ ...current, clearToken: event.target.checked }))} className="accent-[var(--color-accent-strong)]" /> Kayıtlı anahtarı sil
            </span>
          ) : (
            <span className="mt-1 block text-xs text-mute">Şifrelenerek saklanır, bir daha gösterilmez</span>
          )}
        </label>
        <label className="block">
          <span className="label">Uygulama gizli anahtarı</span>
          <input className="input py-2.5 text-sm" type="password" autoComplete="off" value={form.appSecret} placeholder={props.hasAppSecret ? 'Kayıtlı, değiştirmek için yenisini girin' : 'Meta uygulamasının App Secret değeri'} onChange={(event) => setForm((current) => ({ ...current, appSecret: event.target.value }))} />
          {props.hasAppSecret ? (
            <span className="mt-1 flex items-center gap-2 text-xs text-mute">
              <input type="checkbox" checked={form.clearAppSecret} onChange={(event) => setForm((current) => ({ ...current, clearAppSecret: event.target.checked }))} className="accent-[var(--color-accent-strong)]" /> Kayıtlı anahtarı sil
            </span>
          ) : (
            <span className="mt-1 block text-xs text-mute">Gelen mesajların gerçekten Meta&apos;dan geldiğini doğrular</span>
          )}
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-line p-3 text-sm">
        <input type="checkbox" className="mt-1 accent-[var(--color-accent-strong)]" checked={form.autoSend} onChange={(event) => setForm((current) => ({ ...current, autoSend: event.target.checked }))} />
        <span>
          <span className="block text-ink">Otomatik gönderim</span>
          <span className="block text-xs text-mute">Kampanyada e-postası olmayan ve WhatsApp izni bulunan kişilere onaylı şablon mesai saatinde otomatik gider. İzni olmayanlar elle gönderim kuyruğunda kalır.</span>
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <MotionButton small disabled={pending} onClick={() => run(() => saveWhatsappAction(form))}>
          Kaydet
        </MotionButton>
        <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run(testWhatsappConnection)}>
          Bağlantıyı test et
        </MotionButton>
        <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run(submitWhatsappTemplates)}>
          Şablonu Meta&apos;ya gönder
        </MotionButton>
        <MotionButton small variant="ghost" disabled={pending || !props.cloudReady} onClick={() => run(refreshWhatsappTemplates)}>
          Şablon durumunu yenile
        </MotionButton>
      </div>

      {notice ? (
        <p className={`mt-3 text-sm ${notice.ok ? 'text-ink' : 'text-mute'}`} role="status">
          {notice.message}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CopyField label="Webhook adresi (Callback URL)" value={props.webhookUrl} />
        <CopyField label="Doğrulama anahtarı (Verify token)" value={props.verifyToken} />
      </div>
      <p className="mt-2 text-xs text-mute">Meta uygulamanızda WhatsApp, Yapılandırma, Webhook bölümüne bu iki değeri girin ve messages alanına abone olun.</p>

      {props.templates.length ? (
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line text-sm">
          {props.templates.map((item) => (
            <li key={item.language} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-ink">{props.initial.templateName} · {item.language}</span>
              <span className="text-xs text-mute">
                {statusLabels[item.status] ?? item.status}
                {item.reason ? ` (${item.reason})` : ''}
              </span>
            </li>
          ))}
          {props.templatesCheckedAt ? <li className="px-4 py-2 text-xs text-mute">Son kontrol {when(props.templatesCheckedAt)}</li> : null}
        </ul>
      ) : null}

      <details className="mt-5 rounded-2xl border border-line p-4">
        <summary className="cursor-pointer text-sm text-ink">Şablon metinleri</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {props.templateTexts.map((item) => (
            <div key={item.language} className="rounded-2xl bg-soft p-4 text-xs leading-5 text-body">
              <div className="text-mute">{item.language === 'tr' ? 'Türkçe' : 'İngilizce'} · Pazarlama</div>
              <p className="mt-2 text-ink">{item.body}</p>
              <p className="mt-2 text-mute">{item.footer}</p>
              <p className="mt-2">
                Düğme: {item.button} → <span className="break-all">{item.url}</span>
              </p>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-5 flex flex-wrap items-end gap-2">
        <label className="block min-w-[14rem] flex-1">
          <span className="label">Test mesajı gönder</span>
          <input className="input py-2.5 text-sm" placeholder="+90 5XX XXX XX XX" value={testNumber} onChange={(event) => setTestNumber(event.target.value)} />
        </label>
        <MotionButton small variant="ghost" disabled={pending || !props.cloudReady || !testNumber.trim()} onClick={() => run(() => sendWhatsappTest(testNumber))}>
          Şablonu bu numaraya gönder
        </MotionButton>
      </div>
    </section>
  )
}
