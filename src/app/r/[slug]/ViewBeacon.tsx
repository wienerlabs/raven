'use client'

import { useEffect } from 'react'

export function ViewBeacon({ slug, token, source }: { slug: string; token: string | null; source: 'email' | 'whatsapp' }) {
  useEffect(() => {
    if (navigator.webdriver) return
    const started = Date.now()
    let sent = false
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return
      sent = true
      void fetch('/api/track/view', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, token, source, kind: 'view' }),
        keepalive: true,
      })
    }
    const timer = window.setTimeout(send, 1200)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') window.setTimeout(send, 1200)
    }
    const onLeave = () => {
      const seconds = Math.round((Date.now() - started) / 1000)
      if (!sent || seconds < 5) return
      const payload = new Blob([JSON.stringify({ slug, token, source, kind: 'dwell', seconds })], { type: 'application/json' })
      navigator.sendBeacon?.('/api/track/view', payload)
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [slug, token, source])
  return null
}
