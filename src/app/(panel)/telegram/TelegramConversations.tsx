import Link from 'next/link'
import { ArrowLeft, ArrowRight, Send } from 'lucide-react'
import type { Database } from '@/lib/db'
import { hasAi } from '@/lib/env'
import { getSettings } from '@/lib/settings'
import { formatDateTime } from '@/lib/labels'
import type { ChatMessage } from '@/lib/inbox/chat'
import type { ResolvedTelegram } from '@/lib/telegram/config'
import { telegramThread, type TelegramCounts, type TelegramThreadDetail, type TelegramThreadSummary } from '@/lib/telegram/inbox'
import { getSnippets, renderSnippet } from '@/lib/whatsapp/snippets'
import { inboxHref, listTime, type FilterKey } from '@/lib/whatsapp/format'
import { StageBadge } from '@/components/ui/Badges'
import { LiveRefresh } from '@/components/charts/LiveRefresh'
import { Avatar, ThreadList, type ThreadItem } from '@/components/inbox/ThreadList'
import { HandledToggle, InboxKeys, InfoDrawer, MessageScroller } from '@/components/inbox/ThreadParts'
import { Composer } from '@/components/inbox/Composer'
import { InfoLine, LinkRow, MessageList, ShortcutList } from '@/components/inbox/ThreadView'

const BASE = '/telegram'

function viaLabel(message: ChatMessage): string {
  if (message.kind === 'start') return 'Sohbeti taslak sayfasından başlattı'
  if (message.kind === 'greeting') return 'Otomatik karşılama mesajı'
  return 'Panelden'
}

function chatState(thread: TelegramThreadDetail): string | null {
  if (thread.chat?.movedTo) return 'Başka kişiye geçti'
  if (thread.chat?.blockedAt) return 'Botu engelledi'
  if (thread.chat?.stoppedAt) return 'DUR yazdı'
  return null
}

function ContextPanel({ thread, calendarUrl }: { thread: TelegramThreadDetail; calendarUrl: string | null }) {
  const { contact, pitch, chat } = thread
  const name = `${contact.firstName} ${contact.lastName}`.trim()
  const state = chatState(thread)
  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-col items-center text-center">
        <Avatar name={name} size="lg" />
        <div className="mt-3 text-base text-ink">{name}</div>
        <div className="text-xs text-mute">
          {contact.title ? `${contact.title}, ` : ''}
          {contact.company}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <StageBadge stage={contact.stage} />
          {state ? <span className="pill">{state}</span> : null}
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
        {chat ? (
          <InfoLine
            label="Telegram"
            value={chat.name && chat.username ? `${chat.handle} (${chat.name})` : chat.handle}
            note={chat.movedTo ? `Şu an ${chat.movedTo.name} ile eşleşik` : `${formatDateTime(chat.linkedAt)} tarihinde kişisel taslak bağlantısıyla eşleşti`}
          />
        ) : null}
        {contact.email ? <InfoLine label="E-posta" value={contact.email} /> : null}
      </section>
      <section className="space-y-0.5">
        <h3 className="mb-1.5 text-xs text-mute">Bağlantılar</h3>
        {chat?.movedTo ? <LinkRow href={`/telegram?kisi=${chat.movedTo.id}`} label={`${chat.movedTo.name} sohbeti`} /> : null}
        {chat?.username ? <LinkRow href={`https://t.me/${encodeURIComponent(chat.username)}`} label="Telegram profili" external /> : null}
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
      <ShortcutList />
    </div>
  )
}

function EmptyInbox({ config }: { config: ResolvedTelegram }) {
  return (
    <div className="flex min-h-[26rem] flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-accent-soft text-ink">
        <Send className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-lg text-ink">{config.ready ? 'Henüz Telegram sohbeti yok' : 'Telegram botu bağlı değil'}</h2>
      <p className="mt-1 max-w-md text-sm text-mute">
        {config.ready
          ? 'Alıcılar taslak sayfasındaki ya da e-postadaki "Telegram\'dan yazın" düğmesiyle botu başlattığında sohbet burada açılır ve kişi kendi taslağıyla eşleşir.'
          : "BotFather'dan bir bot oluşturup anahtarını kaydedin. Webhook, açıklama ve komutlar kendiliğinden kurulur, taslak sayfalarına Telegram düğmesi eklenir."}
      </p>
      <Link href="/telegram?sekme=kurulum" className="btn btn-sm mt-5">
        {config.ready ? 'Kurulumu gözden geçir' : 'Kuruluma geç'} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

export async function TelegramConversations({
  db,
  config,
  inbox,
  filter,
  selectedId,
  base,
}: {
  db: Database
  config: ResolvedTelegram
  inbox: { threads: TelegramThreadSummary[]; counts: TelegramCounts }
  filter: FilterKey
  selectedId: string | null
  base: string
}) {
  const now = new Date()
  const [thread, snippets, settings] = await Promise.all([selectedId ? telegramThread(db, selectedId) : Promise.resolve(null), getSnippets(db), getSettings(db)])
  if (inbox.counts.all === 0) return <EmptyInbox config={config} />

  const items: ThreadItem[] = inbox.threads.map((item) => ({
    contactId: item.contactId,
    name: item.name,
    company: item.company,
    from: item.handle,
    phoneLabel: item.handle ?? '',
    verified: true,
    unhandled: item.unhandled,
    preview: item.lastMessage.text.split('\n')[0].slice(0, 140),
    previewOut: item.lastMessage.direction === 'out',
    timeLabel: listTime(item.lastActivityAt, now),
    closingSoon: false,
    note: item.moved ? 'Taşındı' : item.blocked ? 'Engelledi' : item.stopped ? 'DUR' : null,
  }))
  const hrefs = Object.fromEntries(items.map((item) => [item.contactId, inboxHref(filter, item.contactId, BASE)]))
  const nextWaiting = inbox.threads.find((item) => item.unhandled > 0)
  const calendarUrl = /^https?:\/\//i.test(settings.calendarUrl) ? settings.calendarUrl : null

  const composer = thread
    ? (() => {
        const firstName = thread.pitch?.greetingName ?? thread.contact.firstName
        const values = {
          ad: firstName,
          şirket: thread.contact.company,
          çözüm: thread.pitch?.solutionName ?? '',
          taslak: `${base}/r/${thread.contact.slug}`,
          takvim: calendarUrl ?? '',
          gönderen: settings.sender.fullName,
        }
        const blockedReason = !config.token
          ? 'Telegram botu bağlı değil. Yanıt yazmak için Kurulum sekmesinden botu bağlayın.'
          : !thread.chat
            ? 'Bu kişiyle eşleşmiş bir Telegram sohbeti yok.'
            : thread.chat.movedTo
              ? `Bu Telegram hesabı sonra ${thread.chat.movedTo.name} kişisinin taslağından sohbet başlattı. Yeni mesajlar ve yanıtlar o kişinin sohbetinde.`
              : thread.chat.blockedAt
              ? `${firstName} botu engelledi. Telegram üzerinden yazılamıyor; e-posta ya da telefonla dönebilirsiniz.`
              : thread.chat.stoppedAt
                ? `${firstName} DUR yazdı. Kendisi yeniden yazana kadar Telegram'dan mesaj gönderilmez.`
                : null
        return (
          <Composer
            key={`composer-${thread.contact.id}`}
            contactId={thread.contact.id}
            channel="telegram"
            now={now.toISOString()}
            firstName={firstName}
            snippets={snippets.map((snippet) => ({ id: snippet.id, title: snippet.title, text: renderSnippet(snippet.body, values) }))}
            ai={hasAi()}
            blockedReason={blockedReason}
          />
        )
      })()
    : null

  const lastMessage = thread?.messages[thread.messages.length - 1]
  const name = thread ? `${thread.contact.firstName} ${thread.contact.lastName}`.trim() : ''
  const state = thread ? chatState(thread) : null

  return (
    <>
      <LiveRefresh seconds={15} />
      <InboxKeys order={items.map((item) => item.contactId)} selectedId={thread?.contact.id ?? null} hrefs={hrefs} waiting={Boolean(thread && thread.unhandled > 0)} channel="telegram" />
      <div
        className={
          'grid h-[calc(100dvh-18.5rem)] min-h-[26rem] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-3xl border border-line bg-surface lg:h-[calc(100dvh-11.5rem)] lg:min-h-[32rem] ' +
          (thread ? 'lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_18rem]' : 'lg:grid-cols-[20rem_minmax(0,1fr)]')
        }
      >
        <div className={(thread ? 'hidden lg:flex' : 'flex') + ' min-h-0 flex-col border-line lg:border-r'}>
          <ThreadList threads={items} selectedId={thread?.contact.id ?? null} filter={filter} counts={inbox.counts} base={BASE} filters={['all', 'waiting']} placeholder="İsim, şirket ya da kullanıcı adı" />
        </div>

        {thread ? (
          <section className="@container flex min-h-0 flex-col" aria-label={`${name} ile sohbet`}>
            <div className="flex items-center gap-2 border-b border-line px-3 py-3 sm:gap-3 sm:px-4">
              <Link href={inboxHref(filter, null, BASE)} scroll={false} className="chip lg:hidden" aria-label="Sohbetlere dön">
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              <span className="hidden @md:block">
                <Avatar name={name} />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/kisiler/${thread.contact.id}`} className="block truncate text-sm text-ink underline-offset-2 hover:underline">
                  {name}
                </Link>
                <div className="truncate text-xs text-mute">
                  {thread.contact.company}
                  {thread.chat ? ` · ${thread.chat.handle}` : ''}
                </div>
              </div>
              {state ? <span className="pill hidden @md:inline-flex">{state}</span> : null}
              <HandledToggle contactId={thread.contact.id} waiting={thread.unhandled > 0} channel="telegram" />
              <InfoDrawer title="Kişi bilgileri">
                <ContextPanel thread={thread} calendarUrl={calendarUrl} />
              </InfoDrawer>
            </div>
            <MessageScroller key={`messages-${thread.contact.id}`} marker={`${thread.messages.length}:${lastMessage?.at.getTime() ?? 0}`} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
              <MessageList messages={thread.messages} now={now} label={viaLabel} />
            </MessageScroller>
            {composer}
          </section>
        ) : (
          <div className="hidden min-h-0 flex-col items-center justify-center gap-3 p-10 text-center lg:flex">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-accent-soft text-ink">
              <Send className="h-5 w-5" />
            </span>
            <h2 className="text-lg text-ink">Bir sohbet seçin</h2>
            <p className="max-w-sm text-sm text-mute">Soldaki listeden bir kişiyi açın. Telegram&apos;da süre sınırı yok: kişi DUR diyene kadar panelden istediğiniz zaman yazabilirsiniz.</p>
            {nextWaiting ? (
              <Link href={inboxHref(filter, nextWaiting.contactId, BASE)} scroll={false} className="btn btn-sm mt-2">
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
