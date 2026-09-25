'use client'

import { useState } from 'react'
import { Check, Copy, RefreshCw, Sparkles, X } from 'lucide-react'
import { draftEmailReplyAction } from '@/app/actions/replies'
import { mailtoHref } from '@/lib/email/mailto'

const MAILTO_LIMIT = 1900

export function EmailDraft({ responseId, email }: { responseId: string; email: string }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [text, setText] = useState('')
  const [subject, setSubject] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setPhase('loading')
    setError(null)
    setCopied(false)
    try {
      const result = await draftEmailReplyAction(responseId)
      if (result.ok) {
        setText(result.text)
        setSubject(result.subject)
        setPhase('ready')
      } else {
        setError(result.message)
        setPhase(text ? 'ready' : 'idle')
      }
    } catch {
      setError('Taslak üretilemedi, yeniden deneyin.')
      setPhase(text ? 'ready' : 'idle')
    }
  }

  if (phase !== 'ready') {
    return (
      <div className="contents">
        <button type="button" className="btn-ghost btn-sm" onClick={generate} disabled={phase === 'loading'}>
          <Sparkles className={'h-3.5 w-3.5 ' + (phase === 'loading' ? 'animate-pulse' : '')} />
          {phase === 'loading' ? 'Taslak yazılıyor' : 'AI ile yanıt taslağı'}
        </button>
        {error ? (
          <span className="text-xs text-mute" role="status">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  const link = mailtoHref(email, { subject, body: text })
  const mailto = link && link.length <= MAILTO_LIMIT ? link : null
  return (
    <div className="basis-full space-y-2 rounded-2xl border border-accent-strong p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-mute">
        <span className="truncate">Konu: {subject}</span>
        <button type="button" className="chip" onClick={() => setPhase('idle')} aria-label="Taslağı kapat">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea className="textarea min-h-40" value={text} maxLength={4000} onChange={(event) => setText(event.target.value)} aria-label="Yanıt taslağı" />
      <div className="flex flex-wrap items-center gap-2">
        {mailto ? (
          <a href={mailto} className="btn btn-sm">
            E-posta uygulamasında aç
          </a>
        ) : null}
        <button
          type="button"
          className="chip"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </button>
        <button type="button" className="chip" onClick={generate}>
          <RefreshCw className="h-3.5 w-3.5" /> Yeniden yaz
        </button>
        {error ? <span className="text-xs text-mute">{error}</span> : null}
        {link && !mailto ? <span className="text-xs text-mute">Metin e-posta bağlantısına sığmıyor; kopyalayıp e-postanıza yapıştırın.</span> : null}
      </div>
      <p className="text-[11px] text-mute">Taslak kişinin çözümüne ve yazdıklarına dayanır. Göndermeden önce okuyup düzenleyin.</p>
    </div>
  )
}
