import type { Metadata } from 'next'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/security/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Giriş' }

export default async function LoginPage() {
  if (await isAdmin()) redirect('/')
  return (
    <div className="light-scope relative flex min-h-screen items-center justify-center px-5">
      <div className="raven-backdrop" aria-hidden />
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 text-xl tracking-tight text-ink">
          <Image src="/brand/wiener-mark-256.png" alt="" width={28} height={28} className="h-7 w-7" priority />
          Raven
        </div>
        <h1 className="mt-8 text-4xl leading-tight tracking-tight text-ink">Her kişiye kendi çözümü.</h1>
        <p className="mt-3 text-sm text-mute">Wiener Labs iç aracı. Devam etmek için yönetici şifresini girin.</p>
        <div className="card mt-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
