'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { confirmIntent } from '@/app/actions/public'

export function IntentConfirm({ slug, token, intent, preview, savedLabel }: { slug: string; token: string | null; intent: 'meeting' | 'info' | 'later'; preview: boolean; savedLabel: string }) {
  const [saved, setSaved] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (preview || started.current) return
    started.current = true
    const timer = window.setTimeout(() => {
      void confirmIntent(slug, token, intent).then((result) => setSaved(result.ok))
    }, 600)
    return () => window.clearTimeout(timer)
  }, [slug, token, intent, preview])
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${saved ? 'border-accent bg-accent text-on-accent' : 'border-line bg-soft text-mute'}`}>
      <Check className="h-3 w-3" />
      {saved ? savedLabel : '...'}
    </span>
  )
}
