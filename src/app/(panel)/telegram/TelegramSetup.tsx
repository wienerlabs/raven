'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { checkTelegramAction, createTeamLinkAction, disconnectTelegramAction, reconnectTelegramAction, saveTelegramBotAction, sendTeamTestAction, unlinkTeamChatAction } from '@/app/actions/telegram'
import type { TelegramStepKey } from '@/lib/telegram/config'
import { MotionButton } from '@/components/ui/MotionButton'
import { Capability, CopyField, StepList, type SetupStep } from '@/components/setup/SetupParts'

export interface TelegramSetupProps {
  username: string | null
  botName: string
  hasToken: boolean
  ready: boolean
  webhookUrl: string
  webhookSetAt: string | null
  webhookError: string | null
  previewLink: string | null
  team: { title: string; linkedAt: string | null } | null
  steps: Array<{ key: TelegramStepKey; done: boolean }>
}

type Result = { ok: boolean; message: string }

function when(value: string | null): string {
  if (!value) return ''
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(value))
}

export function TelegramSetup(props: TelegramSetupProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [token, setToken] = useState('')
  const [links, setLinks] = useState<{ direct: string; group: string; expiresAt: string } | null>(null)
  const [notice, setNotice] = useState<(Result & { step: TelegramStepKey }) | null>(null)
  const [openKey, setOpenKey] = useState<TelegramStepKey | null>(props.steps.find((step) => !step.done)?.key ?? null)
  const done = Object.fromEntries(props.steps.map((step) => [step.key, step.done])) as Record<TelegramStepKey, boolean>
  const receiving = props.ready && !props.webhookError

  const run = (step: TelegramStepKey, task: () => Promise<Result>) =>
    startTransition(async () => {
      setNotice(null)
      const result = await task()
      setNotice({ ...result, step })
      if (result.ok) setToken('')
      router.refresh()
    })

  const createLinks = () =>
    startTransition(async () => {
      setNotice(null)
      const result = await createTeamLinkAction()
      if (result.ok) setLinks({ direct: result.direct, group: result.group, expiresAt: result.expiresAt })
      else setNotice({ ok: false, message: result.message, step: 'team' })
    })

  const status = (step: TelegramStepKey) =>
    notice && notice.step === step ? (
      <p className={`text-sm ${notice.ok ? 'text-ink' : 'text-mute'}`} role="status">
        {notice.message}
      </p>
    ) : null

  const steps: Array<SetupStep<TelegramStepKey>> = [
    {
      key: 'bot',
      title: 'Bot',
      summary: props.username ? `@${props.username}${props.botName ? `, ${props.botName}` : ''} bağlı` : "BotFather'dan alınan bot anahtarı",
      body: (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-mute">
            <li>
              Telegram&apos;da{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer noopener" className="text-ink underline underline-offset-2">
                @BotFather
              </a>{' '}
              ile sohbet açıp /newbot yazın.
            </li>
            <li>Görünen ad olarak şirket adını, kullanıcı adı olarak bot ile biten bir ad seçin (örnek: wienerlabs_bot).</li>
            <li>BotFather&apos;ın verdiği anahtarı aşağıya yapıştırın. Açıklama, komutlar ve webhook kendiliğinden ayarlanır.</li>
          </ol>
          <label className="block max-w-md">
            <span className="label">Bot anahtarı</span>
            <input
              className="input py-2.5 text-sm"
              type="password"
              autoComplete="off"
              value={token}
              placeholder={props.hasToken ? 'Kayıtlı, değiştirmek için yenisini girin' : '123456789:AA...'}
              onChange={(event) => setToken(event.target.value)}
            />
            <span className="mt-1 block text-xs text-mute">Şifrelenerek saklanır, bir daha gösterilmez.</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending || !token.trim()} onClick={() => run('bot', () => saveTelegramBotAction(token))}>
              Kaydet ve bağla
            </MotionButton>
            {props.hasToken ? (
              <MotionButton
                small
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('Telegram bağlantısı kaldırılsın mı? Taslak sayfalarındaki ve e-postalardaki Telegram bağlantısı gizlenir, geçmiş sohbetler kalır.')) run('bot', disconnectTelegramAction)
                }}
              >
                Bağlantıyı kaldır
              </MotionButton>
            ) : null}
            {status('bot')}
          </div>
        </div>
      ),
    },
    {
      key: 'webhook',
      title: 'Gelen mesajlar',
      summary: receiving
        ? `Telegram ${when(props.webhookSetAt)} tarihinde bağlandı`
        : props.webhookError
          ? `Sorun var: ${props.webhookError}`
          : props.hasToken
            ? 'Webhook kurulmayı bekliyor'
            : 'Bot bağlandığında kendiliğinden kurulur',
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">Telegram her mesajı bu adrese, yalnızca Raven&apos;ın bildiği gizli bir anahtarla gönderir. Anahtarı taşımayan istek reddedilir.</p>
          <div className="max-w-xl">
            <CopyField label="Webhook adresi" value={props.webhookUrl} />
          </div>
          {props.webhookError ? <p className="rounded-2xl border border-line bg-soft px-4 py-3 text-xs text-ink">{props.webhookError}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <MotionButton small disabled={pending || !props.hasToken} onClick={() => run('webhook', checkTelegramAction)}>
              Durumu kontrol et
            </MotionButton>
            <MotionButton small variant="ghost" disabled={pending || !props.hasToken} onClick={() => run('webhook', reconnectTelegramAction)}>
              Yeniden bağla
            </MotionButton>
            {status('webhook')}
          </div>
          {props.previewLink ? (
            <div className="rounded-2xl border border-line p-4">
              <div className="text-sm text-ink">Kendinizde deneyin</div>
              <p className="mt-1 text-xs leading-5 text-mute">Bu bağlantı botu önizleme modunda açar: alıcının göreceği karşılama mesajı gelir, sohbet kimseye bağlanmaz ve kayıt tutulmaz.</p>
              <a href={props.previewLink} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm mt-3 inline-flex">
                <ExternalLink className="h-3.5 w-3.5" /> Telegram&apos;da aç
              </a>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'team',
      title: 'Ekip bildirimleri',
      optional: true,
      summary: props.team ? `${props.team.title || 'Sohbet'} bildirimleri alıyor` : "Yeni mesajlar ve yanıtlar Telegram'a da düşsün",
      body: (
        <div className="space-y-4">
          <p className="text-sm text-mute">Bir kişi yanıt verdiğinde, taslak sayfasından not bıraktığında ya da WhatsApp ve Telegram&apos;dan yazdığında bildirim bu sohbete de gelir. Kendi sohbetinizi ya da ekibin grubunu bağlayabilirsiniz.</p>
          {props.team ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="pill">
                {props.team.title || 'Sohbet'}
                {props.team.linkedAt ? ` · ${when(props.team.linkedAt)}` : ''}
              </span>
              <MotionButton small disabled={pending} onClick={() => run('team', sendTeamTestAction)}>
                Test bildirimi gönder
              </MotionButton>
              <MotionButton small variant="ghost" disabled={pending} onClick={() => run('team', unlinkTeamChatAction)}>
                Ayır
              </MotionButton>
            </div>
          ) : null}
          {links ? (
            <div className="space-y-3 rounded-2xl border border-line p-4">
              <p className="text-xs leading-5 text-mute">Bağlantı {when(links.expiresAt)} saatine kadar geçerli ve tek kullanımlık. Açtığınız sohbette Başlat&apos;a basmanız yeterli.</p>
              <div className="flex flex-wrap gap-2">
                <a href={links.direct} target="_blank" rel="noreferrer noopener" className="btn btn-sm">
                  <ExternalLink className="h-3.5 w-3.5" /> Kendi sohbetime bağla
                </a>
                <a href={links.group} target="_blank" rel="noreferrer noopener" className="btn-ghost btn-sm">
                  <ExternalLink className="h-3.5 w-3.5" /> Bir gruba ekle
                </a>
              </div>
              <button type="button" className="chip" onClick={() => router.refresh()}>
                Bağladım, yenile
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <MotionButton small variant={props.team ? 'ghost' : undefined} disabled={pending || !props.ready} onClick={createLinks}>
                {props.team ? 'Başka bir sohbete taşı' : 'Bağlantı oluştur'}
              </MotionButton>
              {!props.ready ? <span className="text-xs text-mute">Önce botu ve webhooku kurun.</span> : null}
            </div>
          )}
          {status('team')}
        </div>
      ),
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <StepList steps={steps} done={done} openKey={openKey} onToggle={(key) => setOpenKey(openKey === key ? null : key)} />
      <aside className="space-y-4">
        <div className="card">
          <h2 className="text-sm text-ink">Şu an çalışanlar</h2>
          <ul className="mt-4 space-y-3">
            <Capability on={props.ready} label="Telegram düğmesi" detail="Taslak sayfalarında ve e-postalarda" />
            <Capability on={receiving} label="Gelen mesajlar" detail="Sohbetler sekmesine düşer, yazan kişi tanınır" />
            <Capability on={props.hasToken} label="Panelden yanıt" detail="Süre sınırı yok, kişi DUR diyene kadar" />
            <Capability on={Boolean(props.team)} label="Ekip bildirimleri" detail="Telegram sohbetine ya da gruba" />
          </ul>
        </div>
        <div className="card text-xs leading-5 text-mute">
          Telegram&apos;da bot ilk mesajı atamaz. Kişi taslak sayfasındaki ya da e-postadaki düğmeyle botu başlattığında sohbet açılır, karşılama mesajı gider ve kişi kendi taslağıyla eşleşir. Sonrasında panelden istediğiniz zaman yazabilirsiniz.
        </div>
      </aside>
    </div>
  )
}
