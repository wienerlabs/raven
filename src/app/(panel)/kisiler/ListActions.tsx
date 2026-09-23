'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveClean, generateMissing } from '@/app/actions/contacts'
import { researchMissing } from '@/app/actions/data'
import { MotionButton } from '@/components/ui/MotionButton'

export function ListActions({ ai }: { ai: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [running, setRunning] = useState<'generate' | 'research' | null>(null)

  const approve = () =>
    startTransition(async () => {
      const result = await approveClean()
      setMessage(result.message)
      router.refresh()
    })

  const generate = async () => {
    setRunning('generate')
    let total = 0
    try {
      for (let round = 0; round < 200; round++) {
        const result = await generateMissing(3)
        total += result.done
        setMessage(`${total} içerik üretildi, ${result.remaining} kaldı.${result.ok ? '' : ` ${result.message}`}`)
        router.refresh()
        if ((!result.ok && result.done === 0) || result.remaining <= 0) break
      }
    } finally {
      setRunning(null)
    }
  }

  const research = async () => {
    setRunning('research')
    try {
      for (let round = 0; round < 200; round++) {
        const result = await researchMissing(8)
        setMessage(result.remaining > 0 ? `Araştırılıyor, ${result.remaining} alan adı kaldı.` : 'Tüm alan adları araştırıldı.')
        router.refresh()
        if (result.remaining <= 0) break
      }
    } finally {
      setRunning(null)
    }
  }

  const loop = (kind: 'generate' | 'research') => (kind === 'generate' ? generate() : research())

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <MotionButton variant="ghost" small disabled={running !== null} onClick={() => void loop('research')}>
          {running === 'research' ? 'Araştırılıyor' : 'Web sitelerini araştır'}
        </MotionButton>
        {ai ? (
          <MotionButton variant="ghost" small disabled={running !== null} onClick={() => void loop('generate')}>
            {running === 'generate' ? 'Üretiliyor' : 'Eksik içerikleri AI ile üret'}
          </MotionButton>
        ) : null}
        <MotionButton small disabled={pending || running !== null} onClick={approve}>
          Uyarısız olanları onayla
        </MotionButton>
      </div>
      {message ? <p className="max-w-md text-right text-xs text-mute">{message}</p> : null}
    </div>
  )
}
