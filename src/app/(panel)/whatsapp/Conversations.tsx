import Link from 'next/link'
import type { ReactNode } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, MessageCircle, ShieldAlert } from 'lucide-react'
import type { Database } from '@/lib/db'
import { hasAi } from '@/lib/env'
import { getSettings } from '@/lib/settings'
import { formatPhone } from '@/lib/contacts/phone'
import type { ResolvedWhatsapp } from '@/lib/whatsapp/config'
import { whatsappThread, type ThreadDetail, type ThreadMessage, type whatsappInbox } from '@/lib/whatsapp/inbox'
import { REPLY_WINDOW_MS } from '@/lib/whatsapp/inbound'
import { getSnippets, renderSnippet } from '@/lib/whatsapp/snippets'
import { clockTime, dayLabel, inboxHref, listTime, localDayKey, type FilterKey } from '@/lib/whatsapp/format'
import { StageBadge } from '@/components/ui/Badges'
import { LiveRefresh } from '@/components/charts/LiveRefresh'
import { LinkNumberButton } from '@/components/whatsapp/LinkNumberButton'
import { Avatar, ThreadList, type ThreadItem } from '@/components/whatsapp/inbox/ThreadList'
import { HandledToggle, InboxKeys, InfoDrawer, MessageScroller, WindowChip } from '@/components/whatsapp/inbox/ThreadParts'
import { Composer } from '@/components/whatsapp/inbox/Composer'

const CLOSING_SOON_MS = 3 * 60 * 60 * 1000
const urlPattern = /(https?:\/\/[^\s<>"']+)/g

function linkify(text: string): ReactNode[] {
  return text.split(urlPattern).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part
    const url = part.replace(/[.,;:!?)]+$/, '')
    return (
      <span key={index}>
        <a href={url} target="_blank" rel="noreferrer noopener" className="break-all underline decoration-mute/60 underline-offset-2 transition hover:decoration-ink">
          {url}
        </a>
        {part.slice(url.length)}
      </span>
    )
  })
}

function viaLabel(message: ThreadMessage): string {
  if (message.kind === 'first-touch') return message.via === 'template' ? 'İlk mesaj, onaylı şablonla' : 'İlk mesaj, elle gönderildi'
  return message.via === 'manual' ? "Kendi WhatsApp'ınızdan" : 'Panelden'
}

function Bubble({ message }: { message: ThreadMessage }) {
  const out = message.direction === 'out'
  const touch = message.kind === 'first-touch'
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-[88%] rounded-3xl px-4 py-2.5 text-sm leading-6 text-ink sm:max-w-[74%] ' +
          (out ? 'rounded-br-lg bg-accent-soft ' : 'rounded-bl-lg border border-line bg-soft ') +
          (touch ? 'border border-dashed border-accent-strong' : '')
        }
      >
        {touch ? <p className="mb-1 text-[11px] text-mute">{viaLabel(message)}</p> : null}
        <p className="whitespace-pre-line break-words">{linkify(message.text)}</p>
        <p className="mt-1 text-right text-[11px] text-mute">
          {clockTime(message.at)}
          {out && !touch ? ` · ${viaLabel(message)}` : ''}
        </p>
      </div>
    </div>
  )
}

function Messages({ thread, now }: { thread: ThreadDetail; now: Date }) {
  const groups: Array<{ key: string; label: string; items: ThreadMessage[] }> = []
  for (const message of thread.messages) {
    const key = localDayKey(message.at)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(message)
    else groups.push({ key, label: dayLabel(message.at, now), items: [message] })
  }
  if (!groups.length) return <p className="py-10 text-center text-sm text-mute">Bu sohbette henüz mesaj yok.</p>
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.key} className="space-y-1.5">
          <div className="flex justify-center py-3">
            <span className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] text-mute">{group.label}</span>
          </div>
          {group.items.map((message) => (
            <Bubble key={`${message.kind}-${message.id}`} message={message} />
          ))}
        </div>
      ))}
    </div>
  )
}

function InfoLine({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line px-3 py-2">
      <div className="text-[11px] text-mute">{label}</div>
      <div className="break-all text-sm text-ink">{value}</div>
      {note ? <div className="text-[11px] text-mute">{note}</div> : null}
    </div>
  )
}

function LinkRow({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  const content = (
    <>
      <span>{label}</span>
      {external ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
    </>
  )
  const className = 'flex items-center justify-between gap-3 rounded-2xl px-3 py-2 text-sm text-ink transition hover:bg-soft'
  return external ? (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

const shortcuts: Array<[string, string]> = [
  ['J', 'Sonraki sohbet'],
  ['K', 'Önceki sohbet'],
  ['R', 'Yanıt yaz'],
  ['E', 'Yanıtlandı işaretle'],
  ['/', 'Sohbetlerde ara, yazarken hazır yanıtlar'],
]

function ContextPanel({ thread, calendarUrl }: { thread: ThreadDetail; calendarUrl: string | null }) {
  const { contact, pitch } = thread
  const name = `${contact.firstName} ${contact.lastName}`.trim()
  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={name} size="lg" flagged={!thread.verified} />
        <div className="mt-3 text-base text-ink">{name}</div>
        <div className="text-xs text-mute">
          {contact.title ? `${contact.title}, ` : ''}
          {contact.company}
        </div>
        <div className="mt-2">
          <StageBadge stage={contact.stage} />
        </div>
      </div>
      {pitch ? (
        <section>
          <h3 className="text-xs text-mute">Önerilen çözüm</h3>
          <p className="mt-1 text-sm text-ink">{pitch.solutionName}</p>
          <p className="mt-0.5 text-xs leading-5 text-mute">{pitch.tagline}</p>
        </section>
      ) : null}
      <section className="space-y-2">
        <h3 className="text-xs text-mute">İletişim</h3>
        {thread.from ? <InfoLine label="WhatsApp" value={formatPhone(thread.from)} note={thread.verified ? 'Kayıtlı numarayla eşleşiyor' : 'Kayıtlı numarayla eşleşmiyor'} /> : null}
        {contact.phone && contact.phone !== thread.from ? <InfoLine label="Kayıtlı numara" value={formatPhone(contact.phone)} /> : null}
        {contact.email ? <InfoLine label="E-posta" value={contact.email} /> : null}
      </section>
      <section className="space-y-0.5">
        <h3 className="mb-1.5 text-xs text-mute">Bağlantılar</h3>
        <LinkRow href={`/kisiler/${contact.id}`} label="Kişi sayfası" />
        <LinkRow href={`/r/${contact.slug}?onizleme=1`} label="Taslak sayfası" external />
        {calendarUrl ? <LinkRow href={calendarUrl} label="Takvim bağlantısı" external /> : <LinkRow href="/ayarlar" label="Takvim bağlantısı ekleyin" />}
        <LinkRow href="/ayarlar#hazir-yanitlar" label="Hazır yanıtları düzenle" />
      </section>
      {contact.notes ? (
        <section>
          <h3 className="text-xs text-mute">Notlar</h3>
          <p className="mt-1 whitespace-pre-line text-xs leading-5 text-body">{contact.notes}</p>
        </section>
      ) : null}
      <section>
        <h3 className="text-xs text-mute">Kısayollar</h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="contents">
              <dt>
                <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-line bg-soft px-1.5 py-0.5 text-[11px] text-ink">{key}</kbd>
              </dt>
              <dd className="text-mute">{label}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

function EmptyInbox({ config }: { config: ResolvedWhatsapp }) {
  const receiving = Boolean(config.webhookVerifiedAt) && config.hasAppSecret
  return (
    <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-accent-soft text-ink">
        <MessageCircle className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg text-ink">{receiving ? 'Henüz WhatsApp mesajı yok' : 'Gelen mesajlar için bağlantı gerekli'}</h2>
      <p className="mt-1 max-w-md text-sm text-mute">
        {receiving
          ? "Alıcılar e-postadaki ya da taslak sayfasındaki \"WhatsApp'tan yazın\" düğmesine bastığında sohbetler burada açılır ve yazan kişi otomatik tanınır."
          : "Mesajların Raven'a düşmesi için Cloud API bağlantısını ve webhook doğrulamasını tamamlayın. O zamana kadar alıcılar iş numaranıza yazabilir, yanıtlar WhatsApp uygulamanızda kalır."}
      </p>
      <Link href="/whatsapp?sekme=kurulum" className="btn btn-sm mt-5">
        {receiving ? 'Kurulumu gözden geçir' : 'Kuruluma geç'} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

export async function Conversations({ db, config, inbox, filter, selectedId, base }: { db: Database; config: ResolvedWhatsapp; inbox: Awaited<ReturnType<typeof whatsappInbox>>; filter: FilterKey; selectedId: string | null; base: string }) {
  const now = new Date()
  const [thread, snippets, settings] = await Promise.all([selectedId ? whatsappThread(db, selectedId, base) : Promise.resolve(null), getSnippets(db), getSettings(db)])
  if (inbox.counts.all === 0) return <EmptyInbox config={config} />

  const channel = config.cloud ? 'api' : 'app'
  const items: ThreadItem[] = inbox.threads.map((item) => ({
    contactId: item.contactId,
    name: item.name,
    company: item.company,
    from: item.from,
    phoneLabel: formatPhone(item.from),
    verified: item.verified,
    unhandled: item.unhandled,
    preview: item.lastMessage.text.split('\n')[0].slice(0, 140),
    previewOut: item.lastMessage.direction === 'out',
    timeLabel: listTime(item.lastActivityAt, now),
    closingSoon: channel === 'api' && item.unhandled > 0 && item.windowClosesAt.getTime() > now.getTime() && item.windowClosesAt.getTime() - now.getTime() < CLOSING_SOON_MS,
  }))
  const hrefs = Object.fromEntries(items.map((item) => [item.contactId, inboxHref(filter, item.contactId)]))
  const nextWaiting = inbox.threads.find((item) => item.unhandled > 0)
  const calendarUrl = /^https?:\/\//i.test(settings.calendarUrl) ? settings.calendarUrl : null

  const composer = thread
    ? (() => {
        const values = {
          ad: thread.pitch?.greetingName ?? thread.contact.firstName,
          şirket: thread.contact.company,
          çözüm: thread.pitch?.solutionName ?? '',
          taslak: `${base}/r/${thread.contact.slug}`,
          takvim: calendarUrl ?? '',
          gönderen: settings.sender.fullName,
        }
        return (
          <Composer
            key={`composer-${thread.contact.id}`}
            contactId={thread.contact.id}
            channel={channel}
            waDigits={thread.from ? thread.from.replace(/\D/g, '') : null}
            closesAt={thread.lastInboundAt ? new Date(thread.lastInboundAt.getTime() + REPLY_WINDOW_MS).toISOString() : null}
            now={now.toISOString()}
            firstName={thread.pitch?.greetingName ?? thread.contact.firstName}
            snippets={snippets.map((snippet) => ({ id: snippet.id, title: snippet.title, text: renderSnippet(snippet.body, values) }))}
            ai={hasAi()}
          />
        )
      })()
    : null

  const lastMessage = thread?.messages[thread.messages.length - 1]
  const name = thread ? `${thread.contact.firstName} ${thread.contact.lastName}`.trim() : ''

  return (
    <>
      <LiveRefresh seconds={15} />
      <InboxKeys order={items.map((item) => item.contactId)} selectedId={thread?.contact.id ?? null} hrefs={hrefs} waiting={Boolean(thread && thread.unhandled > 0)} />
      <div
        className={
          'grid h-[calc(100dvh-18.5rem)] min-h-[26rem] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-3xl border border-line bg-surface lg:h-[calc(100dvh-11.5rem)] lg:min-h-[32rem] ' +
          (thread ? 'lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_18rem]' : 'lg:grid-cols-[20rem_minmax(0,1fr)]')
        }
      >
        <div className={(thread ? 'hidden lg:flex' : 'flex') + ' min-h-0 flex-col border-line lg:border-r'}>
          <ThreadList threads={items} selectedId={thread?.contact.id ?? null} filter={filter} counts={inbox.counts} />
        </div>

        {thread ? (
          <section className="@container flex min-h-0 flex-col" aria-label={`${name} ile sohbet`}>
            <div className="flex items-center gap-2 border-b border-line px-3 py-3 sm:gap-3 sm:px-4">
              <Link href={inboxHref(filter, null)} scroll={false} className="chip lg:hidden" aria-label="Sohbetlere dön">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <span className="hidden @md:block">
                <Avatar name={name} flagged={!thread.verified} />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/kisiler/${thread.contact.id}`} className="block truncate text-sm text-ink underline-offset-2 hover:underline">
                  {name}
                </Link>
                <div className="truncate text-xs text-mute">
                  {thread.contact.company}
                  {thread.from ? ` · ${formatPhone(thread.from)}` : ''}
                </div>
              </div>
              {channel === 'api' && thread.lastInboundAt ? <WindowChip closesAt={new Date(thread.lastInboundAt.getTime() + REPLY_WINDOW_MS).toISOString()} now={now.toISOString()} /> : null}
              <HandledToggle contactId={thread.contact.id} waiting={thread.unhandled > 0} />
              <InfoDrawer title="Kişi bilgileri">
                <ContextPanel thread={thread} calendarUrl={calendarUrl} />
              </InfoDrawer>
            </div>
            {!thread.verified && thread.from ? (
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-soft px-4 py-2.5 text-xs text-mute">
                <ShieldAlert className="h-4 w-4 shrink-0 text-ink" />
                <span className="min-w-[12rem] flex-1">Bu numara {thread.contact.firstName} adına kayıtlı değil; mesaj referans koduyla eşleşti. Bağlantıyı başkası iletmiş olabilir, emin olduğunuzda numarayı bağlayın.</span>
                <LinkNumberButton contactId={thread.contact.id} />
              </div>
            ) : null}
            <MessageScroller key={`messages-${thread.contact.id}`} marker={`${thread.messages.length}:${lastMessage?.at.getTime() ?? 0}`} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
              <Messages thread={thread} now={now} />
            </MessageScroller>
            {composer}
          </section>
        ) : (
          <div className="hidden min-h-0 flex-col items-center justify-center gap-3 p-10 text-center lg:flex">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-accent-soft text-ink">
              <MessageCircle className="h-5 w-5" />
            </span>
            <h2 className="text-lg text-ink">Bir sohbet seçin</h2>
            <p className="max-w-sm text-sm text-mute">Soldaki listeden bir kişiyi açın. J ve K ile sohbetler arasında gezinir, R ile yanıt yazmaya başlarsınız.</p>
            {nextWaiting ? (
              <Link href={inboxHref(filter, nextWaiting.contactId)} scroll={false} className="btn btn-sm mt-2">
                Sıradaki bekleyen sohbeti aç <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        )}

        {thread ? (
          <aside className="hidden min-h-0 overflow-y-auto border-l border-line 2xl:block" aria-label="Kişi bilgileri">
            <ContextPanel thread={thread} calendarUrl={calendarUrl} />
          </aside>
        ) : null}
      </div>
    </>
  )
}
