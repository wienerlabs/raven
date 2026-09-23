'use client'

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { confirmIntent } from '@/app/actions/public'

const interactionEvents = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

export function IntentConfirm({ slug, token, intent, preview, savedLabel }: { slug: string; token: string | null; intent: 'meeting' | 'info' | 'later'; preview: boolean; savedLabel: string }) {
  const [saved, setSaved] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (preview || navigator.webdriver) return
    const confirm = () => {
      if (started.current || document.visibilityState !== 'visible') return
      started.current = true
      cleanup()
      void confirmIntent(slug, token, intent).then((result) => setSaved(result.ok))
    }
    const timer = window.setTimeout(confirm, 4000)
    const cleanup = () => {
      window.clearTimeout(timer)
      for (const name of interactionEvents) window.removeEventListener(name, confirm)
    }
    for (const name of interactionEvents) window.addEventListener(name, confirm, { passive: true, once: true })
    return cleanup
  }, [slug, token, intent, preview])
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${saved ? 'border-accent bg-accent text-on-accent' : 'border-line bg-soft text-mute'}`}>
      <Check className="h-3 w-3" />
      {saved ? savedLabel : '...'}
    </span>
  )
}
