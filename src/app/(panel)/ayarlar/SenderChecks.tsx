'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck } from 'lucide-react'
import { checkSenders, type SenderCheck } from '@/app/actions/settings'
import { MotionButton } from '@/components/ui/MotionButton'

export function SenderChecks({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [checks, setChecks] = useState<SenderCheck[] | null>(null)
  return (
    <div className="mt-4">
      <MotionButton variant="ghost" small disabled={!enabled || pending} onClick={() => startTransition(async () => setChecks(await checkSenders()))}>
        <ShieldCheck className="h-3.5 w-3.5" /> {pending ? 'Kontrol ediliyor' : 'SMTP ve DNS kayıtlarını kontrol et'}
      </MotionButton>
      {!enabled ? <p className="mt-2 text-[11px] text-mute">Konsol modunda kontrol yapılmaz.</p> : null}
      {checks ? (
        <ul className="mt-3 space-y-2">
          {checks.map((check) => (
            <li key={check.id} className="rounded-2xl border border-line p-3 text-xs">
              <div className="text-ink">{check.email}</div>
              <div className="mt-1 space-y-0.5 text-mute">
                <div>SMTP: {check.smtp}</div>
                <div className="break-all">SPF: {check.spf}</div>
                <div className="break-all">DMARC: {check.dmarc}</div>
                <div>DKIM: {check.dkim}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
