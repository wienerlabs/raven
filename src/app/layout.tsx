import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const sora = localFont({
  src: '../../public/fonts/sora-light.ttf',
  weight: '300',
  style: 'normal',
  display: 'swap',
  variable: '--font-sora',
})

export const metadata: Metadata = {
  title: { default: 'Raven', template: '%s · Raven' },
  description: 'Wiener Labs kişiye özel çözüm ve iletişim motoru.',
  robots: { index: false, follow: false },
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
