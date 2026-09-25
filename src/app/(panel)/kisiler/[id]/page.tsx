import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { getDb } from '@/lib/db'
import { contactDetail } from '@/lib/queries'
import { getSettings } from '@/lib/settings'
import { baseUrl, hasAi } from '@/lib/env'
import { activeSenders } from '@/lib/channels/email'
import { renderEmail, renderWhatsapp } from '@/lib/email/render'
import { checkPitch } from '@/lib/pitch/validate'
import { eventLabels, flagLabels, formatDateTime, intentLabels, stepLabels } from '@/lib/labels'
import { formatPhone } from '@/lib/contacts/phone'
import { waMeLink } from '@/lib/channels/whatsapp'
import { FlagBadge, IntentBadge, MessageBadge, ReviewBadge, StageBadge } from '@/components/ui/Badges'
import { updateContact, savePitchFields, savePitchJson, sendTest } from '@/app/actions/contacts'
import { ContactForm } from './ContactForm'
import { DetailActions } from './DetailActions'
import { PitchEditor } from './PitchEditor'
import { PreviewTabs } from './PreviewTabs'
import { TestSendForm } from './TestSendForm'
import { getBrand } from '@/lib/brand/logo'
import { resolveWhatsapp } from '@/lib/whatsapp/config'
import { resolveTelegram } from '@/lib/telegram/config'
import { contactTelegram } from '@/lib/telegram/inbox'

export const metadata: Metadata = { title: 'Kişi' }

export default async function ContactPage({ params }: PageProps<'/kisiler/[id]'>) {
  const { id } = await params
  const db = await getDb()
  const detail = await contactDetail(db, id)
  if (!detail) notFound()
  const { contact, pitch } = detail
  const [settings, brand, whatsapp, telegram, telegramChat] = await Promise.all([getSettings(db), getBrand(db), resolveWhatsapp(db), resolveTelegram(db), contactTelegram(db, contact.id)])
  const base = baseUrl()
  const sender = activeSenders()[0]
  const replyTo = sender?.replyTo ?? sender?.email ?? 'raven@localhost.test'
  const previewToken = 'onizleme-onizleme-000'
  const content = pitch?.content ?? null
  const check = content ? checkPitch(content, { firstName: contact.firstName, lastName: contact.lastName, email: contact.email, company: contact.company }) : null
  const previews = content
    ? [0, 1, 2].map((step) =>
        renderEmail(
          { pitch: content, contact: { slug: contact.slug, company: contact.company }, message: { token: previewToken, step, variant: 'a' }, settings, baseUrl: base, replyTo, firstSubject: content.email.subject, brand, whatsappNumber: whatsapp.businessNumber, telegramBot: telegram.ready ? telegram.username : null },
          false,
        ),
      )
    : []
  const whatsappText = content ? renderWhatsapp(content, `${base}/r/${contact.slug}`) : ''
  const displayFirst = content?.person.firstName ?? contact.firstName
  const displayLast = content?.person.lastName ?? contact.lastName

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/kisiler" className="chip">
          <ArrowLeft className="h-3 w-3" /> Kişiler
        </Link>
        <div className="flex gap-2">
          {detail.previousId ? (
            <Link href={`/kisiler/${detail.previousId}`} className="chip" aria-label="Önceki kişi">
              <ChevronLeft className="h-3 w-3" /> Önceki
            </Link>
          ) : null}
          {detail.nextId ? (
            <Link href={`/kisiler/${detail.nextId}`} className="chip" aria-label="Sonraki kişi">
              Sonraki <ChevronRight className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>

      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ReviewBadge status={contact.reviewStatus} />
            <StageBadge stage={contact.stage} />
            {contact.relationship === 'customer' ? <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-xs text-ink">Mevcut müşteri</span> : null}
            <span className="pill">{content?.language === 'en' ? 'İngilizce' : 'Türkçe'}</span>
            {telegramChat ? (
              <Link href={`/telegram?kisi=${contact.id}`} className="pill transition hover:border-accent-strong">
                Telegram {telegramChat.handle}
                {telegramChat.blocked ? ', engelledi' : telegramChat.stopped ? ', DUR yazdı' : ''}
              </Link>
            ) : null}
          </div>
          <h1 className="mt-3 text-3xl tracking-tight text-ink sm:text-4xl">
            {displayFirst} {displayLast}
          </h1>
          <p className="mt-1 text-sm text-mute">
            {contact.title ?? 'Ünvan yok'} · {content?.company.name ?? contact.company}
          </p>
          {contact.holdReason ? <p className="mt-2 max-w-xl rounded-2xl border border-line bg-soft px-4 py-2 text-xs text-ink">{contact.holdReason}</p> : null}
        </div>
        <DetailActions id={contact.id} reviewStatus={contact.reviewStatus} ai={hasAi()} hasPitch={Boolean(content)} landingUrl={`/r/${contact.slug}?onizleme=1`} />
      </section>

      {content ? (
        <section className="card">
          <div className="text-xs text-mute">Önerilen çözüm</div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-2xl tracking-tight text-ink">{content.solution.name}</h2>
            <span className="text-xs text-mute">
              {pitch?.source === 'ai' ? `AI ile üretildi${pitch.model ? ` (${pitch.model})` : ''}` : pitch?.source === 'manual' ? 'Elle düzenlendi' : 'İçe aktarıldı'} · sürüm {pitch?.version}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-body">{content.solution.tagline}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {content.solution.steps.map((step, index) => (
              <div key={step.title} className="rounded-2xl border border-line p-4">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-accent bg-accent text-[10px] text-on-accent">{index + 1}</span>
                  {step.title}
                </div>
                <p className="mt-2 text-xs leading-5 text-mute">{step.detail}</p>
              </div>
            ))}
          </div>
          {check && (check.errors.length > 0 || check.warnings.length > 0) ? (
            <div className="mt-4 rounded-2xl border border-line bg-soft p-4 text-xs">
              <div className="text-ink">Kalite kontrolü</div>
              <ul className="mt-2 space-y-1 text-mute">
                {[...check.errors, ...check.warnings].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="card text-sm text-mute">Bu kişi için henüz içerik yok. {hasAi() ? 'Sağ üstten AI ile üretebilirsiniz.' : 'İçe aktar sayfasından içerik dosyası yükleyin veya ANTHROPIC_API_KEY tanımlayın.'}</section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          {content ? (
            <PreviewTabs
              emails={previews.map((preview, index) => ({ label: stepLabels[index], subject: preview.subject, preheader: preview.preheader, html: preview.html }))}
              whatsapp={whatsappText}
              whatsappLink={contact.phone ? waMeLink(contact.phone, whatsappText) : null}
              landingUrl={`/r/${contact.slug}?onizleme=1`}
            />
          ) : null}
          {content ? <PitchEditor action={savePitchFields.bind(null, contact.id)} jsonAction={savePitchJson.bind(null, contact.id)} pitch={content} /> : null}
        </div>

        <div className="space-y-6">
          {content ? <TestSendForm action={sendTest.bind(null, contact.id)} /> : null}
          <ContactForm
            action={updateContact.bind(null, contact.id)}
            contact={{
              firstName: contact.firstName,
              lastName: contact.lastName,
              title: contact.title ?? '',
              company: contact.company,
              email: contact.email ?? '',
              phone: contact.phone ? formatPhone(contact.phone) : '',
              relationship: contact.relationship,
              notes: contact.notes ?? '',
              whatsappOptIn: contact.whatsappOptIn,
            }}
          />

          <div className="card">
            <h3 className="text-lg text-ink">Şirket araştırması</h3>
            {detail.research ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-mute">Web sitesi</span>
                  {detail.research.url ? (
                    <a href={detail.research.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline decoration-line">
                      {detail.research.url.replace(/^https?:\/\//, '').slice(0, 40)} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-mute">{detail.research.error ?? 'Ulaşılamadı'}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-mute">E-posta sunucusu (MX)</span>
                  <span className={detail.research.mxOk ? 'text-ink' : 'text-mute'}>{detail.research.mxOk ? (detail.research.mxHosts[0] ?? 'Var') : 'Bulunamadı, bu adrese e-posta ulaşmayabilir'}</span>
                </div>
                {detail.research.title ? <p className="text-xs text-mute">{detail.research.title}</p> : null}
                {detail.research.description ? <p className="text-xs text-mute">{detail.research.description}</p> : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-mute">Henüz araştırılmadı.</p>
            )}
            {content ? <p className="mt-3 border-t border-line pt-3 text-xs text-mute">{content.company.summary} (güven: {content.company.confidence === 'high' ? 'yüksek' : content.company.confidence === 'medium' ? 'orta' : 'düşük'})</p> : null}
            {contact.flags.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {contact.flags.map((flag) => (
                  <FlagBadge key={flag} flag={flag} />
                ))}
              </div>
            ) : null}
            {contact.flags.length ? (
              <ul className="mt-2 space-y-0.5 text-[11px] text-mute">
                {contact.flags.map((flag) => (
                  <li key={flag}>
                    {flagLabels[flag] ?? flag}: {flagHelp[flag] ?? 'İnceleyin.'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="card">
            <h3 className="text-lg text-ink">Zaman çizelgesi</h3>
            {detail.messages.length === 0 && detail.events.length === 0 && detail.responses.length === 0 ? <p className="mt-2 text-sm text-mute">Henüz bir hareket yok.</p> : null}
            {detail.responses.length ? (
              <ul className="mt-3 space-y-2">
                {detail.responses.map((response) => (
                  <li key={response.id} className="rounded-2xl border border-accent bg-accent-soft p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <IntentBadge intent={response.intent} />
                      <span className="text-xs text-mute">{formatDateTime(response.createdAt)}</span>
                    </div>
                    {response.body ? <p className="mt-2 whitespace-pre-line text-xs text-ink">{response.body}</p> : <p className="mt-1 text-xs text-mute">{intentLabels[response.intent]} bağlantısıyla yanıtladı.</p>}
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.messages.length ? (
              <ul className="mt-3 divide-y divide-line text-sm">
                {detail.messages.map((message) => (
                  <li key={message.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-ink">
                      {message.channel === 'whatsapp' ? 'WhatsApp' : stepLabels[message.step] ?? `Adım ${message.step}`}
                      {message.isTest ? <span className="ml-1 text-xs text-mute">(test: {message.testRecipient})</span> : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-mute">
                      <MessageBadge status={message.status} />
                      {formatDateTime(message.sentAt ?? message.scheduledAt)}
                    </span>
                    {message.lastError && message.status !== 'sent' ? <span className="w-full text-[11px] text-mute">{message.lastError}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.events.length ? (
              <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-mute">
                {detail.events.slice(0, 25).map((event) => (
                  <li key={event.id} className="flex justify-between gap-2">
                    <span>{eventLabels[event.type] ?? event.type}</span>
                    <span>{formatDateTime(event.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

const flagHelp: Record<string, string> = {
  'name-from-email': 'Hitapta e-postadaki isim kullanıldı, doğru kişiye gittiğinden emin olun.',
  'name-uncertain': 'Soyadının yazımı doğrulanmadı.',
  'company-uncertain': 'Şirketin ne yaptığı net değil, çözümü kontrol edin.',
  'generic-mailbox': 'Adres ortak bir kutuya ait, kişiye ulaşmayabilir.',
  'email-name-mismatch': 'E-posta başka birine ait olabilir.',
  'title-missing': 'Ünvan bilinmiyor.',
  'crypto-company': 'Kripto şirketi: çözüm kripto dışı tutuldu.',
  'sanctions-review': 'Yaptırım kapsamındaki ülke bağlantısı olabilir, hukuki onay olmadan göndermeyin.',
  'jurisdiction-review': 'Alıcının ülkesi ticari e-posta için önceden onay isteyebilir.',
}
