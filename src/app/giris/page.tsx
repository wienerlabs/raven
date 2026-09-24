import type { Metadata, Viewport } from 'next'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { hasPasskeys } from '@/lib/auth/passkeys'
import { isAdmin } from '@/lib/security/session'
import { themeScript } from '@/components/shell/theme-script'
import { ThemeToggle } from '@/components/shell/ThemeToggle'
import { RavenBadge } from '@/components/brand/RavenMark'
import { WienerCredit } from '@/components/brand/WienerMark'
import { PasskeyLoginButton } from '@/components/auth/PasskeyLoginButton'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Giriş' }
export const viewport: Viewport = { themeColor: '#0b0b0e' }

export default async function LoginPage() {
  if (await isAdmin()) redirect('/')
  const db = await getDb()
  const passkeysReady = await hasPasskeys(db)
  return (
    <div className="relative flex min-h-screen flex-col px-5">
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <div className="raven-backdrop" aria-hidden />
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
        <span className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
          <RavenBadge className="h-8 w-8" />
          Raven
        </span>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center pb-16 pt-4">
        <div className="w-full max-w-sm">
          <RavenBadge className="h-16 w-16" />
          <h1 className="mt-7 text-4xl leading-tight tracking-tight text-ink">Her kişiye kendi çözümü.</h1>
          <p className="mt-3 text-sm text-mute">
            {passkeysReady ? 'Face ID ile ya da yönetici şifresiyle giriş yapın.' : 'Yönetici şifresiyle giriş yapın. Ayarlar sayfasından cihaz eklendiğinde Face ID ile giriş de açılır.'}
          </p>
          <div className="card mt-8 space-y-5">
            {passkeysReady ? (
              <>
                <PasskeyLoginButton />
                <div className="flex items-center gap-3 text-xs text-mute">
                  <span className="h-px flex-1 bg-line" />
                  veya
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            ) : null}
            <LoginForm secondary={passkeysReady} />
          </div>
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 py-5 text-xs text-mute">
        <WienerCredit />
        <span>Yalnızca yetkili ekip üyeleri içindir</span>
      </footer>
    </div>
  )
}
