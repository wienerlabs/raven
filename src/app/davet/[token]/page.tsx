import type { Metadata, Viewport } from 'next'
import Link from 'next/link'
import { getDb } from '@/lib/db'
import { findInvite } from '@/lib/auth/passkeys'
import { themeScript } from '@/components/shell/theme-script'
import { ThemeToggle } from '@/components/shell/ThemeToggle'
import { RavenBadge } from '@/components/brand/RavenMark'
import { WienerCredit } from '@/components/brand/WienerMark'
import { InviteRegister } from './InviteRegister'

export const metadata: Metadata = { title: 'Davet', referrer: 'no-referrer' }
export const viewport: Viewport = { themeColor: '#0b0b0e' }

const steps = ['Aşağıdaki düğmeye basın.', 'Telefonunuz ya da bilgisayarınız Face ID, Touch ID veya cihaz şifrenizi sorar.', 'Onayladığınızda Raven açılır. Sonraki girişlerde tek dokunuş yeterli.']

export default async function InvitePage({ params }: PageProps<'/davet/[token]'>) {
  const { token } = await params
  const db = await getDb()
  const invite = await findInvite(db, token)
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
          {invite ? (
            <>
              <h1 className="mt-7 text-4xl leading-tight tracking-tight text-ink">Merhaba {invite.name}.</h1>
              <p className="mt-3 text-sm text-mute">Raven&apos;a şifresiz, Face ID ile giriş kurulumu. Yüz verileriniz cihazınızdan çıkmaz; Raven yalnızca cihazınızın ürettiği bir imzayı doğrular.</p>
              <div className="card mt-8 space-y-5">
                <ol className="space-y-2 text-sm text-body">
                  {steps.map((step, index) => (
                    <li key={step} className="flex gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[10px] text-mute">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <InviteRegister token={token} />
              </div>
              <p className="mt-4 text-xs text-mute">Bağlantı tek kullanımlıktır ve {new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(invite.expiresAt)} tarihine kadar geçerlidir.</p>
            </>
          ) : (
            <>
              <h1 className="mt-7 text-3xl leading-tight tracking-tight text-ink">Bu davet artık geçerli değil.</h1>
              <p className="mt-3 text-sm text-mute">Bağlantı kullanılmış ya da süresi dolmuş olabilir. Ekibinizden yeni bir davet isteyin.</p>
              <Link href="/giris" className="btn-ghost mt-6">
                Giriş sayfasına git
              </Link>
            </>
          )}
        </div>
      </main>
      <footer className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 py-5 text-xs text-mute">
        <WienerCredit />
      </footer>
    </div>
  )
}
