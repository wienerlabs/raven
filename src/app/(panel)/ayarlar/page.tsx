import type { Metadata } from 'next'
import { getDb } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { environmentSummary } from '@/lib/readiness'
import { emailProviderLabel } from '@/lib/channels/email'
import { saveSettingsAction } from '@/app/actions/settings'
import { accessOverview } from '@/lib/auth/passkeys'
import { resolveWhatsapp } from '@/lib/whatsapp/config'
import { getAuthPolicy } from '@/lib/auth/policy'
import { getBrand } from '@/lib/brand/logo'
import { defaultSnippets, getSnippets } from '@/lib/whatsapp/snippets'
import { BrandLogoCard } from './BrandLogoCard'
import { isMemberSession, requireAdmin } from '@/lib/security/session'
import { SettingsForm } from './SettingsForm'
import { SenderChecks } from './SenderChecks'
import { AccessPanel } from './AccessPanel'
import { SnippetsEditor } from './SnippetsEditor'

export const metadata: Metadata = { title: 'Ayarlar' }

function Line({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 text-sm last:border-b-0">
      <span className="text-mute">{label}</span>
      <span className={`text-right ${ok === false ? 'text-mute' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

export default async function SettingsPage() {
  const session = await requireAdmin()
  const db = await getDb()
  const [settings, access, whatsapp, policy, brand, snippets] = await Promise.all([getSettings(db), accessOverview(db), resolveWhatsapp(db), getAuthPolicy(db), getBrand(db), getSnippets(db)])
  const viewerMemberId = isMemberSession(session) ? session.sub : null
  const viewerHasPasskey = Boolean(viewerMemberId && access.members.some((member) => member.id === viewerMemberId && member.passkeys.length > 0))
  const env = environmentSummary()
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl tracking-tight text-ink">Ayarlar</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">Gönderen kimliği, teklif metni ve hukuki bilgiler e-postalara, taslak sayfalarına ve AI üretimine yansır. E-posta şifreleri ortam değişkenlerinde, WhatsApp anahtarları şifrelenmiş olarak veritabanında tutulur.</p>
      </div>

      <AccessPanel
        members={access.members.map((member) => ({
          id: member.id,
          name: member.name,
          lastLoginAt: member.lastLoginAt?.toISOString() ?? null,
          passkeys: member.passkeys.map((key) => ({ id: key.id, label: key.label, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null, backedUp: key.backedUp })),
        }))}
        invites={access.invites.map((invite) => ({ id: invite.id, name: invite.name, expiresAt: invite.expiresAt.toISOString() }))}
        viewerMemberId={viewerMemberId}
        viewerName={session.name}
        passwordLogin={policy.passwordLogin}
        canLockToPasskeys={viewerHasPasskey}
      />

      <BrandLogoCard logo={brand.logo ? { hash: brand.logo.hash, width: brand.logo.width, height: brand.logo.height, size: brand.logo.size } : null} showCompanyName={brand.showCompanyName} company={settings.sender.company} />

      <SettingsForm action={saveSettingsAction} settings={settings} />

      <SnippetsEditor initial={snippets} defaults={defaultSnippets} />

      <section id="altyapi" className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="text-lg text-ink">Altyapı durumu</h2>
          <div className="mt-3">
            <Line label="E-posta gönderimi" value={emailProviderLabel(env.provider)} ok={env.provider !== 'console'} />
            <Line label="Genel adres" value={env.baseUrl} ok={env.baseUrl.startsWith('https://')} />
            <Line label="Zamanlayıcı (CRON_SECRET)" value={env.cronSecret ? 'Tanımlı' : 'Tanımlı değil'} ok={env.cronSecret} />
            <Line label="AI üretimi" value={env.ai ? `Açık (${env.aiModel})` : 'ANTHROPIC_API_KEY yok'} ok={env.ai} />
            <Line label="WhatsApp" value={whatsapp.mode === 'cloud' ? 'Otomatik gönderim (Cloud API)' : whatsapp.businessNumber ? 'Tıkla-yaz açık, gönderim elle' : 'Elle gönderim'} ok={whatsapp.mode === 'cloud' || Boolean(whatsapp.businessNumber)} />
            <Line label="Ekip bildirim e-postası" value={env.notify === 'resend' ? `Resend (${env.notifyFrom})` : env.notify === 'campaign' ? 'Kampanya kutusundan' : 'Kapalı'} ok={env.notify !== 'none'} />
            <Line label="Slack bildirimi" value={env.slack ? 'Açık' : 'Kapalı'} ok={env.slack} />
          </div>
          {env.sendersError ? <p className="mt-3 text-xs text-ink">RAVEN_SENDERS okunamadı: {env.sendersError}</p> : null}
        </div>
        <div className="card">
          <h2 className="text-lg text-ink">Gönderenler</h2>
          <p className="mt-1 text-sm text-mute">Birden çok kutu tanımlarsanız gönderimler aralarında dağıtılır ve her yanıt kendi kutusuna düşer.</p>
          <ul className="mt-3 space-y-2">
            {env.senders.length === 0 ? <li className="text-sm text-mute">Tanımlı gönderen yok. SENDER_EMAIL ve SMTP bilgilerini ekleyin.</li> : null}
            {env.senders.map((sender) => (
              <li key={sender.id} className="rounded-2xl border border-line p-3 text-sm">
                <div className="text-ink">
                  {sender.name} &lt;{sender.email}&gt;
                </div>
                <div className="mt-1 text-xs text-mute">
                  Günlük limit {sender.dailyLimit} · SMTP {sender.smtp ? 'var' : 'yok'} · IMAP {sender.imap ? 'var' : 'yok'} · Yanıt adresi {sender.replyTo}
                </div>
              </li>
            ))}
          </ul>
          <SenderChecks enabled={env.provider !== 'console'} />
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg text-ink">Kurulum özeti</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-body">
          <li>Soğuk gönderim için ana alan adınız yerine ayrı bir alt alan adı veya ikinci bir alan adı kullanın ve SPF, DKIM, DMARC kayıtlarını ekleyin.</li>
          <li>Google Workspace kullanıyorsanız gönderen kutusunda iki adımlı doğrulamayı açıp bir uygulama şifresi oluşturun; SMTP için smtp.gmail.com:465, IMAP için imap.gmail.com:993 kullanılır.</li>
          <li>Yeni kutuları ilk iki hafta günde 20 ile 40 e-postayla ısıtın, sonra limiti kademeli artırın.</li>
          <li>Ortam değişkenlerini ayarlayın: EMAIL_PROVIDER=smtp, SENDER_EMAIL, SENDER_NAME, SMTP_HOST, SMTP_USER, SMTP_PASS, IMAP_HOST, RAVEN_BASE_URL, CRON_SECRET.</li>
          <li>Kampanyadan önce birkaç kişiye kendi adresinize test gönderin, spam klasörünü ve mobil görünümü kontrol edin.</li>
        </ol>
      </section>
    </div>
  )
}
