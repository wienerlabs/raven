import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { phoneContactsWithoutWhatsapp, whatsappConversations, whatsappQueue } from '@/lib/queries'
import { baseUrl } from '@/lib/env'
import { renderWhatsapp } from '@/lib/email/render'
import { buildLinks } from '@/lib/email/links'
import { templateDefinitions, waMeLink } from '@/lib/channels/whatsapp'
import { ensureVerifyToken, resolveFrom } from '@/lib/whatsapp/config'
import { REPLY_WINDOW_MS, replyWindowOpen } from '@/lib/whatsapp/inbound'
import { formatDateTime } from '@/lib/labels'
import { formatPhone } from '@/lib/contacts/phone'
import { MessageBadge } from '@/components/ui/Badges'
import { EmptyState } from '@/components/ui/Metric'
import { WhatsappReply } from '@/components/whatsapp/WhatsappReply'
import { LinkNumberButton } from '@/components/whatsapp/LinkNumberButton'
import { QueueActions, AddToQueue } from './QueueActions'
import { WhatsappSetup } from './WhatsappSetup'

export const metadata: Metadata = { title: 'WhatsApp' }

export default async function WhatsappPage() {
  const db = await getDb()
  const stored = await ensureVerifyToken(db)
  const config = resolveFrom(stored)
  const [queue, candidates, conversations] = await Promise.all([whatsappQueue(db), phoneContactsWithoutWhatsapp(db), whatsappConversations(db)])
  const base = baseUrl()
  const manual = queue.filter((row) => row.message.status === 'manual')
  const done = queue.filter((row) => row.message.status !== 'manual')
  const now = new Date()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl tracking-tight text-ink">WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          İki yönlü çalışır: alıcılar e-postadan ve kişisel taslak sayfasından tek dokunuşla size WhatsApp&apos;tan yazabilir, siz de telefonu olan kişilere kişiye özel mesajla ulaşırsınız. Her mesaj taslak sayfasının bağlantısını taşır.
        </p>
      </div>

      <WhatsappSetup
        businessNumberLabel={config.businessNumber ? formatPhone(config.businessNumber) : null}
        initial={{ businessNumber: config.businessNumber ?? '', autoSend: config.autoSend, phoneNumberId: stored.phoneNumberId, wabaId: stored.wabaId, templateName: stored.templateName }}
        hasToken={config.hasToken}
        hasAppSecret={config.hasAppSecret}
        cloudReady={Boolean(config.cloud)}
        mode={config.mode}
        webhookUrl={`${base}/api/webhooks/whatsapp`}
        verifyToken={config.verifyToken}
        webhookVerifiedAt={config.webhookVerifiedAt}
        templates={stored.templates}
        templatesCheckedAt={stored.templatesCheckedAt}
        templateTexts={templateDefinitions(base)}
      />

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink">Konuşmalar</h2>
            <p className="mt-0.5 text-sm text-mute">Size WhatsApp&apos;tan yazan kişiler. Son mesajdan sonraki 24 saat içinde buradan serbest metinle yanıt verebilirsiniz.</p>
          </div>
          {conversations.length ? <span className="pill">{conversations.length} kişi</span> : null}
        </div>
        {conversations.length === 0 ? (
          <EmptyState title="Henüz WhatsApp mesajı yok" body={config.businessNumber ? 'Alıcılar "WhatsApp\'tan yazın" düğmesine bastığında konuşmalar burada görünür.' : 'İş numarasını kaydettiğinizde e-postalara ve taslak sayfalarına WhatsApp düğmesi eklenir.'} />
        ) : (
          <ul className="space-y-3">
            {conversations.map((thread) => {
              const open = replyWindowOpen(thread.lastInboundAt, now)
              const closesAt = new Date(thread.lastInboundAt.getTime() + REPLY_WINDOW_MS).toISOString()
              return (
                <li key={thread.contact.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/kisiler/${thread.contact.id}`} className="text-lg tracking-tight text-ink">
                        {thread.contact.firstName} {thread.contact.lastName}
                      </Link>
                      <div className="text-sm text-mute">
                        {thread.contact.company} · {formatPhone(thread.from)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {thread.verified ? null : <span className="pill">Doğrulanmamış numara</span>}
                      {thread.unhandled ? <span className="rounded-full border border-accent bg-accent px-2.5 py-0.5 text-xs text-on-accent">{thread.unhandled} yeni</span> : <span className="pill">Yanıtlandı</span>}
                    </div>
                  </div>
                  {thread.verified ? null : (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3 text-xs text-mute">
                      <span className="min-w-0 flex-1">Bu numara kişinin kaydında yok; mesaj taslak sayfasındaki referans koduyla eşleşti. Bağlantıyı başkası da iletmiş olabilir. Yazanın gerçekten bu kişi olduğundan eminseniz numarayı bağlayın.</span>
                      <LinkNumberButton contactId={thread.contact.id} />
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    {thread.messages.map((message, index) => (
                      <div key={`${message.at.toISOString()}-${index}`} className={`flex ${message.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${message.direction === 'out' ? 'bg-accent-soft text-ink' : 'bg-soft text-ink'}`}>
                          <p className="whitespace-pre-line">{message.text}</p>
                          <p className="mt-1 text-[11px] text-mute">{formatDateTime(message.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 border-t border-line pt-4">
                    {config.cloud ? (
                      <WhatsappReply contactId={thread.contact.id} windowOpen={open} closesAt={closesAt} placeholder={`${thread.contact.firstName} için yanıtınız`} />
                    ) : thread.from ? (
                      <a href={waMeLink(thread.from, `Merhaba ${thread.contact.firstName}, `)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                        WhatsApp&apos;ta yanıtla
                      </a>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg text-ink">Elle gönderim kuyruğu</h2>
            <p className="mt-0.5 max-w-3xl text-sm text-mute">
              {config.mode === 'cloud'
                ? 'Otomatik gönderim açık. Meta kuralı gereği otomatik mesaj yalnızca WhatsApp izni olan kişilere gider; diğerleri burada tek tıkla gönderilmeyi bekler.'
                : '"WhatsApp\'ta aç" metni hazır şekilde kendi WhatsApp\'ınızda açar; gönderip "Gönderildi" diye işaretlemeniz yeterli.'}
            </p>
          </div>
          <span className="pill">{manual.length} mesaj bekliyor</span>
        </div>
        {manual.length === 0 ? (
          <EmptyState
            title="Elle gönderilecek mesaj yok"
            body={candidates.length ? 'Telefonu olan onaylı kişileri aşağıdan kuyruğa ekleyebilirsiniz.' : 'Kampanya başladığında e-postası olmayan ama telefonu olan kişiler burada listelenir. Kişiler sayfasından numara da ekleyebilirsiniz.'}
          />
        ) : (
          <ul className="space-y-3">
            {manual.map(({ message, contact, pitch }) => {
              const links = buildLinks(base, contact.slug, message.token)
              const text = renderWhatsapp(pitch, links.whatsappLanding)
              return (
                <li key={message.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/kisiler/${contact.id}`} className="text-lg tracking-tight text-ink">
                        {pitch.person.firstName} {pitch.person.lastName}
                      </Link>
                      <div className="text-sm text-mute">
                        {contact.company} · {formatPhone(contact.phone)}
                      </div>
                    </div>
                    <QueueActions messageId={message.id} link={contact.phone ? waMeLink(contact.phone, text) : null} />
                  </div>
                  <p className="mt-4 whitespace-pre-line rounded-2xl bg-soft p-4 text-sm leading-6 text-ink">{text}</p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {candidates.length ? (
        <section className="card">
          <h2 className="text-lg text-ink">Telefonu olan onaylı kişiler</h2>
          <p className="mt-1 text-sm text-mute">E-postası olsa bile WhatsApp ile de yazmak istediğiniz kişileri kuyruğa ekleyin.</p>
          <AddToQueue contacts={candidates.map(({ contact, pitch }) => ({ id: contact.id, name: `${pitch.person.firstName} ${pitch.person.lastName}`, company: contact.company, phone: formatPhone(contact.phone) }))} />
        </section>
      ) : null}

      {done.length ? (
        <section className="card">
          <h2 className="text-lg text-ink">Gönderilenler</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {done.map(({ message, contact }) => (
              <li key={message.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/kisiler/${contact.id}`} className="text-ink">
                  {contact.firstName} {contact.lastName} <span className="text-mute">· {contact.company}</span>
                </Link>
                <span className="flex items-center gap-2 text-xs text-mute">
                  <MessageBadge status={message.status} />
                  {formatDateTime(message.sentAt ?? message.scheduledAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
