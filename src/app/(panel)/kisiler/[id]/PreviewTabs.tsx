'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

interface EmailPreview {
  label: string
  subject: string
  preheader: string
  html: string
}

export function PreviewTabs({ emails, whatsapp, whatsappLink, landingUrl }: { emails: EmailPreview[]; whatsapp: string; whatsappLink: string | null; landingUrl: string }) {
  const tabs = [...emails.map((email) => email.label), 'WhatsApp', 'Taslak sayfası']
  const [active, setActive] = useState(0)
  const email = emails[active]
  return (
    <div className="card p-0">
      <div className="flex flex-wrap items-center gap-1 border-b border-line p-3">
        {tabs.map((tab, index) => (
          <button key={tab} type="button" onClick={() => setActive(index)} className={`rounded-full px-3 py-1.5 text-xs transition ${active === index ? 'bg-accent text-on-accent' : 'text-mute hover:bg-soft hover:text-ink'}`}>
            {tab}
          </button>
        ))}
      </div>
      {email ? (
        <div>
          <div className="space-y-1 border-b border-line px-5 py-3 text-sm">
            <div>
              <span className="text-mute">Konu: </span>
              <span className="text-ink">{email.subject}</span>
            </div>
            <div className="truncate text-xs text-mute">Önizleme metni: {email.preheader}</div>
          </div>
          <iframe title={`${email.label} önizlemesi`} srcDoc={email.html} sandbox="allow-same-origin" className="h-[880px] w-full rounded-b-3xl bg-[#f6f6f6]" />
        </div>
      ) : null}
      {active === emails.length ? (
        <div className="p-5">
          <div className="mx-auto max-w-md rounded-3xl bg-[#efeae2] p-4">
            <div className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl rounded-tr-md bg-[#d9fdd3] px-4 py-3 text-sm leading-6 text-[#111111] shadow-[0_1px_1px_rgba(0,0,0,0.08)]">{whatsapp}</div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-mute">
            <span>Bağlantı önizlemesinde kişiye özel başlık ve görsel görünür.</span>
            {whatsappLink ? (
              <a href={whatsappLink} target="_blank" rel="noreferrer" className="btn btn-sm">
                WhatsApp&apos;ta aç
              </a>
            ) : (
              <span>Telefon numarası yok.</span>
            )}
          </div>
        </div>
      ) : null}
      {active === emails.length + 1 ? (
        <div>
          <div className="flex items-center justify-between border-b border-line px-5 py-3 text-xs text-mute">
            <span>Önizleme modunda görüntülemeler kaydedilmez.</span>
            <a href={landingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-ink underline decoration-line">
              Yeni sekmede aç <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <iframe title="Taslak sayfası önizlemesi" src={landingUrl} className="h-[880px] w-full rounded-b-3xl" />
        </div>
      ) : null}
    </div>
  )
}
