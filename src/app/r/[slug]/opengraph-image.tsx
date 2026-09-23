import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getDb } from '@/lib/db'
import { contactBySlug } from '@/lib/public'
import { landingCopy } from '@/lib/landing-copy'

export const alt = 'Wiener Labs kişisel çözüm taslağı'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [font, mark] = await Promise.all([readFile(join(process.cwd(), 'assets/sora-light.ttf')), readFile(join(process.cwd(), 'assets/wiener-mark-128.png'))])
  const db = await getDb()
  const found = await contactBySlug(db, slug)
  const pitch = found?.pitch
  const copy = landingCopy[pitch?.language ?? 'tr']
  const title = pitch?.solution.name ?? 'Wiener Labs'
  const tagline = pitch?.solution.tagline ?? ''
  const company = pitch?.company.name ?? ''
  const markSrc = `data:image/png;base64,${mark.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'linear-gradient(135deg, #ffd9e6 0%, #f7d9f7 45%, #e6dcfb 100%)',
          fontFamily: 'Sora',
          color: '#111111',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 30 }}>
            <img src={markSrc} width={44} height={44} alt="" />
            Wiener Labs
          </div>
          {company ? (
            <div style={{ display: 'flex', fontSize: 22, padding: '10px 22px', borderRadius: 999, background: 'rgba(255,255,255,0.7)', border: '1px solid #e6e6e6' }}>{copy.preparedFor(company)}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', fontSize: title.length > 28 ? 64 : 80, letterSpacing: -2.5, lineHeight: 1.05 }}>{title}</div>
          {tagline ? <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.4, color: '#3d3d3d', maxWidth: 980 }}>{tagline.length > 140 ? `${tagline.slice(0, 137)}...` : tagline}</div> : null}
        </div>
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', fontSize: 22, padding: '10px 22px', borderRadius: 999, background: '#d9dbfc', border: '1px solid #c2c6fa' }}>{copy.briefLabel}</div>
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Sora', data: font, weight: 300, style: 'normal' }] },
  )
}
