import type { Metadata } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { phoneContactsWithoutWhatsapp, whatsappQueue } from '@/lib/queries'
import { baseUrl, whatsappMode } from '@/lib/env'
import { renderWhatsapp } from '@/lib/email/render'
import { buildLinks } from '@/lib/email/links'
import { waMeLink } from '@/lib/channels/whatsapp'
import { formatDateTime } from '@/lib/labels'
import { formatPhone } from '@/lib/contacts/phone'
import { MessageBadge } from '@/components/ui/Badges'
import { EmptyState } from '@/components/ui/Metric'
import { QueueActions, AddToQueue } from './QueueActions'

export const metadata: Metadata = { title: 'WhatsApp' }

export default async function WhatsappPage() {
  const db = await getDb()
  const [queue, candidates] = await Promise.all([whatsappQueue(db), phoneContactsWithoutWhatsapp(db)])
  const base = baseUrl()
  const mode = whatsappMode()
  const manual = queue.filter((row) => row.message.status === 'manual')
  const done = queue.filter((row) => row.message.status !== 'manual')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl tracking-tight text-ink">WhatsApp</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          E-postası olmayan kişilere WhatsApp ile ulaşılır. Her mesaj kişiye özel metinle ve kişisel taslak sayfasının bağlantısıyla hazırlanır; bağlantı önizlemesinde çözümün adı görünür.
        </p>
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-ink">Gönderim modu: {mode === 'cloud' ? 'WhatsApp Business Cloud API' : 'Elle gönderim (tek tık)'}</div>
            <p className="mt-1 max-w-3xl text-xs text-mute">
              {mode === 'cloud'
                ? 'Onaylı şablonla otomatik gönderim açık. Meta politikası gereği otomatik mesaj yalnızca WhatsApp izni verilmiş kişilere gider; diğerleri aşağıdaki elle gönderim kuyruğuna düşer.'
                : 'Her satırdaki "WhatsApp\'ta aç" düğmesi, metni hazır şekilde kendi WhatsApp\'ınızda açar; göndere basıp "Gönderildi" diye işaretlemeniz yeterli. Otomatik gönderim için Ayarlar sayfasındaki Cloud API kurulumuna bakın.'}
            </p>
          </div>
          <span className="pill">{manual.length} mesaj bekliyor</span>
        </div>
      </section>

      {manual.length === 0 ? (
        <EmptyState
          title="Elle gönderilecek mesaj yok"
          body={candidates.length ? 'Telefonu olan onaylı kişileri aşağıdan kuyruğa ekleyebilirsiniz.' : 'Kampanya başlatıldığında e-postası olmayan ama telefonu olan kişiler burada listelenir.'}
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
