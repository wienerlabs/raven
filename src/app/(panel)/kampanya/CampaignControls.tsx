'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Pause, Play, Rocket, Trash2 } from 'lucide-react'
import { clearQueue, dispatchNow, launch, pause, resume, syncInboxNow } from '@/app/actions/campaign'
import type { ActionResult } from '@/app/actions/contacts'
import { MotionButton } from '@/components/ui/MotionButton'

interface Props {
  status: 'draft' | 'running' | 'paused' | 'completed'
  ready: number
  estimateDays: number
  perDay: number
  provider: 'smtp' | 'resend' | 'console'
  providerLabel: string
  hasImap: boolean
  cron: boolean
}

export function CampaignControls({ status, ready, estimateDays, perDay, provider, providerLabel, hasImap, cron }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [live, setLive] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setResult(await task())
      setConfirming(false)
      router.refresh()
    })

  useEffect(() => {
    if (!live) return
    let cancelled = false
    const tick = async () => {
      try {
        const report = await dispatchNow()
        if (cancelled) return
        const stamp = new Date().toLocaleTimeString('tr-TR')
        if (report.claimed > 0 || report.errors.length > 0) {
          setLog((lines) => [`${stamp} · ${report.sent} gönderildi, ${report.rescheduled} ertelendi, ${report.cancelled} iptal, ${report.failed} hata${report.errors[0] ? ` (${report.errors[0]})` : ''}`, ...lines].slice(0, 30))
          router.refresh()
        } else {
          setLog((lines) => (lines[0]?.endsWith('bekleniyor') ? [`${stamp} · sıradaki zaman bekleniyor`, ...lines.slice(1)] : [`${stamp} · sıradaki zaman bekleniyor`, ...lines]).slice(0, 30))
        }
      } catch (error) {
        setLog((lines) => [`Hata: ${error instanceof Error ? error.message : String(error)}`, ...lines].slice(0, 30))
      }
      if (!cancelled) timer.current = setTimeout(tick, 20_000)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [live, router])

  const syncInbox = () =>
    startTransition(async () => {
      const outcome = await syncInboxNow()
      const summary = outcome.results.map((item) => (item.error ? `${item.sender}: ${item.error}` : `${item.sender}: ${item.scanned} ileti tarandı, ${item.replies} yanıt, ${item.bounces} geri dönen, ${item.unsubscribes} çıkış`)).join(' · ')
      setResult({ ok: outcome.ok, message: summary || 'IMAP tanımlı gönderen yok.' })
      router.refresh()
    })

  return (
    <section className="card">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="text-xs text-mute">Tek seferde başlat</div>
          <div className="mt-1 text-4xl tracking-tight text-ink">{ready} kişi hazır</div>
          <p className="mt-2 text-sm text-mute">
            {ready > 0
              ? `Günde yaklaşık ${perDay} e-posta ile tahminen ${estimateDays} iş gününde tamamlanır. Onaylı ve henüz iletişime geçilmemiş herkes sıraya girer.`
              : 'Gönderime hazır kişi yok. Kişiler sayfasından içerikleri onaylayın.'}
          </p>
          <p className="mt-2 text-xs text-mute">Gönderim altyapısı: {providerLabel}</p>
          {provider === 'console' ? (
            <p className="mt-3 rounded-2xl border border-line bg-soft px-4 py-3 text-xs text-ink">
              Konsol modundasınız: kampanya başlatılabilir ve akış test edilebilir, ancak e-postalar alıcılara gitmez. Gerçek gönderim için Ayarlar sayfasındaki SMTP kurulumunu tamamlayın.
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <MotionButton disabled={pending} onClick={() => run(launch)}>
                  <Rocket className="h-4 w-4" /> Evet, {ready} kişiyi sıraya al
                </MotionButton>
                <MotionButton variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
                  Vazgeç
                </MotionButton>
              </>
            ) : (
              <MotionButton disabled={pending || ready === 0} onClick={() => setConfirming(true)}>
                <Rocket className="h-4 w-4" /> Kampanyayı başlat
              </MotionButton>
            )}
            {status === 'running' ? (
              <MotionButton variant="ghost" disabled={pending} onClick={() => run(pause)}>
                <Pause className="h-4 w-4" /> Durdur
              </MotionButton>
            ) : null}
            {status === 'paused' ? (
              <MotionButton variant="ghost" disabled={pending} onClick={() => run(resume)}>
                <Play className="h-4 w-4" /> Devam et
              </MotionButton>
            ) : null}
            {status !== 'draft' ? (
              <MotionButton variant="ghost" disabled={pending} onClick={() => run(clearQueue)}>
                <Trash2 className="h-4 w-4" /> Kuyruğu temizle
              </MotionButton>
            ) : null}
          </div>
          {confirming ? <p className="mt-3 max-w-lg text-xs text-ink">Onayladığınızda gönderimler planlanır ve mesai saatlerinde otomatik başlar. Gönderilen e-posta geri alınamaz; istediğiniz an durdurabilirsiniz.</p> : null}
          {result ? <p className="mt-3 text-sm text-ink">{result.message}</p> : null}
        </div>

        <div className="rounded-3xl border border-line p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-ink">Gönderim motoru</div>
            <label className="flex items-center gap-2 text-xs text-mute">
              <input type="checkbox" checked={live} onChange={(event) => setLive(event.target.checked)} className="accent-[var(--color-accent-strong)]" />
              Bu sekmede canlı gönder
            </label>
          </div>
          <p className="mt-2 text-xs text-mute">
            {cron
              ? 'Zamanlayıcı her dakika sıradaki mesajları gönderir. Bu sekme kapalıyken de kampanya ilerler.'
              : 'Zamanlayıcı tanımlı değil. Bu sekmede canlı gönderimi açın veya sunucuda `npm run worker` çalıştırın.'}
          </p>
          <div className="mt-3 h-40 overflow-y-auto rounded-2xl bg-soft p-3 font-mono text-[11px] leading-5 text-mute">{log.length ? log.map((line, index) => <div key={`${line}-${index}`}>{line}</div>) : 'Canlı gönderim kapalı.'}</div>
          <MotionButton variant="ghost" small className="mt-3" disabled={pending || !hasImap} onClick={syncInbox}>
            <Inbox className="h-3.5 w-3.5" /> Gelen kutusunu şimdi tara
          </MotionButton>
          {!hasImap ? <p className="mt-2 text-[11px] text-mute">Yanıtların otomatik yakalanması için gönderene IMAP bilgisi ekleyin.</p> : null}
        </div>
      </div>
    </section>
  )
}
