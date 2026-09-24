import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { baseUrl } from '@/lib/env'
import './globals.css'

const sora = localFont({
  src: '../../public/fonts/sora-light.ttf',
  weight: '300',
  style: 'normal',
  display: 'swap',
  variable: '--font-sora',
})

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: { default: 'Raven', template: '%s · Raven' },
  description: 'Wiener Labs kişiye özel çözüm ve iletişim motoru.',
  robots: { index: false, follow: false },
  openGraph: { siteName: 'Raven', title: 'Raven', description: 'Kişiye özel AI çözümleri, kişisel taslak sayfaları ve tek tıkla yanıt.', locale: 'tr_TR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Raven', description: 'Kişiye özel AI çözümleri, kişisel taslak sayfaları ve tek tıkla yanıt.' },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="tr" className={sora.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
