import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const alt = 'Raven, Wiener Labs pazarlama operatörü'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function dataUri(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`
}

export default async function OpenGraphImage() {
  const [font, raven, wiener] = await Promise.all([
    readFile(join(process.cwd(), 'assets/sora-light.ttf')),
    readFile(join(process.cwd(), 'assets/raven-icon-256.png')),
    readFile(join(process.cwd(), 'assets/wiener-mark-white-128.png')),
  ])
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          backgroundColor: '#0b0b0e',
          backgroundImage: 'radial-gradient(circle at 88% 12%, rgba(217, 219, 252, 0.26), rgba(11, 11, 14, 0) 58%)',
          fontFamily: 'Sora',
          color: '#f2f2f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 34, letterSpacing: -0.5 }}>
            <img src={dataUri(raven)} width={52} height={52} alt="" />
            Raven
          </div>
          <div style={{ display: 'flex', fontSize: 22, padding: '10px 22px', borderRadius: 999, border: '1px solid #2b2b33', color: '#d9d9df' }}>raven.wienerlabs.xyz</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
            <div style={{ display: 'flex', fontSize: 80, letterSpacing: -2.5, lineHeight: 1.05 }}>Her kişiye kendi çözümü.</div>
            <div style={{ display: 'flex', fontSize: 30, lineHeight: 1.4, color: '#9a9aa5' }}>Kişiye özel AI çözümleri, kişisel taslak sayfaları ve tek tıkla yanıt.</div>
          </div>
          <img src={dataUri(raven)} width={236} height={236} alt="" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, color: '#d9d9df' }}>
          <img src={dataUri(wiener)} width={28} height={28} alt="" />
          Wiener Labs pazarlama operatörü
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Sora', data: font, weight: 300, style: 'normal' }] },
  )
}
