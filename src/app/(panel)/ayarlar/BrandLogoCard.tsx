'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { ImageUp } from 'lucide-react'
import { removeLogoAction, setLogoNameAction, uploadLogoAction } from '@/app/actions/brand'
import type { ActionResult } from '@/app/actions/contacts'
import { MotionButton } from '@/components/ui/MotionButton'
import { SubmitButton } from '@/components/ui/SubmitButton'

const DISPLAY_HEIGHT = 28
const DISPLAY_MAX_WIDTH = 220

function displayBox(width: number, height: number) {
  const ratio = width / height
  const scaled = Math.round(DISPLAY_HEIGHT * ratio)
  if (scaled <= DISPLAY_MAX_WIDTH) return { width: scaled, height: DISPLAY_HEIGHT }
  return { width: DISPLAY_MAX_WIDTH, height: Math.max(1, Math.round(DISPLAY_MAX_WIDTH / ratio)) }
}

interface LogoInfo {
  hash: string
  width: number
  height: number
  size: number
}

export function BrandLogoCard({ logo, showCompanyName, company }: { logo: LogoInfo | null; showCompanyName: boolean; company: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(uploadLogoAction, null)
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ url: string; width: number; height: number } | null>(null)

  useEffect(() => {
    if (state?.ok) setDraft(null)
  }, [state])

  useEffect(() => {
    return () => {
      if (draft) URL.revokeObjectURL(draft.url)
    }
  }, [draft])

  const shown = draft ?? (logo ? { url: `/api/brand/logo/${logo.hash}`, width: logo.width, height: logo.height } : null)
  const box = shown ? displayBox(shown.width, shown.height) : null
  const message = notice ?? state?.message ?? null

  return (
    <section id="logo" className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg text-ink">
            <ImageUp className="h-5 w-5" /> E-posta logosu
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Gönderilen e-postaların başında ve alıcının açtığı kişisel sayfalarda görünen logo. E-postalar açık zeminde gösterilir; koyu renkli, şeffaf arka planlı bir PNG en temiz sonucu verir.
          </p>
        </div>
        {logo ? <span className="pill">{logo.width} x {logo.height} px · {Math.max(1, Math.round(logo.size / 1024))} KB</span> : <span className="pill">Varsayılan Wiener Labs işareti</span>}
      </div>

      <div className="light-scope mt-5 rounded-3xl border border-line p-5">
        <div className="text-xs text-mute">E-postada böyle görünür</div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3">
          <span className="flex min-w-0 items-center">
            {shown && box ? (
              <img src={shown.url} alt="" width={box.width} height={box.height} style={{ width: box.width, height: box.height }} />
            ) : (
              <img src="/brand/wiener-mark-email.png" alt="" width={26} height={26} style={{ width: 26, height: 26 }} />
            )}
            {!shown || showCompanyName ? <span className="ml-2 truncate text-[15px] tracking-tight text-ink">{company}</span> : null}
          </span>
          <span className="shrink-0 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-ink">Size özel hazırlandı</span>
        </div>
      </div>

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block min-w-[16rem] flex-1">
          <span className="label">PNG veya JPG, en fazla 512 KB</span>
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg"
            required
            className="input py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-3 file:py-1 file:text-xs file:text-on-accent"
            onChange={(event) => {
              setNotice(null)
              const file = event.target.files?.[0]
              if (!file) {
                setDraft(null)
                return
              }
              const url = URL.createObjectURL(file)
              const image = new Image()
              image.onload = () => setDraft({ url, width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
              image.onerror = () => setNotice('Bu dosya bir görsel olarak açılamadı.')
              image.src = url
            }}
          />
        </label>
        <SubmitButton small pendingLabel="Yükleniyor">
          Logoyu kaydet
        </SubmitButton>
        {logo ? (
          <MotionButton
            small
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeLogoAction()
                setNotice(result.message)
                setDraft(null)
              })
            }
          >
            Varsayılana dön
          </MotionButton>
        ) : null}
      </form>

      <label className="mt-4 flex items-center gap-3 text-sm text-body">
        <input
          type="checkbox"
          className="accent-[var(--color-accent-strong)]"
          defaultChecked={showCompanyName}
          disabled={pending || !logo}
          onChange={(event) => {
            const value = event.target.checked
            startTransition(async () => {
              const result = await setLogoNameAction(value)
              setNotice(result.message)
            })
          }}
        />
        Logonun yanında şirket adını da göster
        {!logo ? <span className="text-xs text-mute">(özel logo yüklenince seçilebilir)</span> : null}
      </label>

      {message ? (
        <p className="mt-3 text-sm text-ink" role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}
