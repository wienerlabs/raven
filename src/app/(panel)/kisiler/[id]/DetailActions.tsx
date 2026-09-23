'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react'
import { bulkUpdate, regenerate, releaseHold, researchContact, type ActionResult } from '@/app/actions/contacts'
import { MotionButton } from '@/components/ui/MotionButton'
import type { ReviewStatus } from '@/lib/db/schema'

export function DetailActions({ id, reviewStatus, ai, hasPitch, landingUrl }: { id: string; reviewStatus: ReviewStatus; ai: boolean; hasPitch: boolean; landingUrl: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const [clearing, setClearing] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      setResult(await task())
      router.refresh()
    })
  return (
    <div className="flex max-w-xl flex-col items-end gap-2">
      {reviewStatus === 'hold' ? (
        <div className="w-full rounded-2xl border border-line bg-soft p-3 text-xs text-ink">
          {clearing ? (
            <div className="space-y-2">
              <p>Bu kişi otomatik olarak beklemeye alındı. Hukuki incelemeyi yaptıysanız ve gönderim uygunsa aşağıya &quot;onaylıyorum&quot; yazın. İşlem kaydedilir.</p>
              <div className="flex gap-2">
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="onaylıyorum" className="input py-1.5 text-xs" aria-label="Onay metni" />
                <MotionButton small disabled={pending || confirmation.trim().toLocaleLowerCase('tr-TR') !== 'onaylıyorum'} onClick={() => run(() => releaseHold(id, confirmation.trim().toLocaleLowerCase('tr-TR')))}>
                  Serbest bırak
                </MotionButton>
              </div>
            </div>
          ) : (
            <button type="button" className="underline" onClick={() => setClearing(true)}>
              Hukuki incelemeyi tamamladım, serbest bırak
            </button>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {hasPitch ? (
          <a href={landingUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
            Taslak sayfası <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => researchContact(id))}>
          <RefreshCw className="h-3 w-3" /> Araştır
        </MotionButton>
        {ai ? (
          <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => regenerate(id))}>
            <Sparkles className="h-3 w-3" /> {hasPitch ? 'Yeniden üret' : 'AI ile üret'}
          </MotionButton>
        ) : null}
        {reviewStatus !== 'excluded' ? (
          <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => bulkUpdate([id], 'exclude'))}>
            Hariç tut
          </MotionButton>
        ) : (
          <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => bulkUpdate([id], 'pending'))}>
            Geri al
          </MotionButton>
        )}
        {reviewStatus !== 'hold' ? (
          <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => bulkUpdate([id], 'hold'))}>
            Beklet
          </MotionButton>
        ) : null}
        {reviewStatus !== 'approved' ? (
          <MotionButton small disabled={pending || !hasPitch} onClick={() => run(() => bulkUpdate([id], 'approve'))}>
            Onayla
          </MotionButton>
        ) : (
          <MotionButton variant="ghost" small disabled={pending} onClick={() => run(() => bulkUpdate([id], 'pending'))}>
            Onayı kaldır
          </MotionButton>
        )}
      </div>
      {result ? <p className="text-right text-xs text-mute">{result.message}</p> : null}
    </div>
  )
}
