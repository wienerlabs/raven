import type { Metadata } from 'next'
import Image from 'next/image'
import { getDb } from '@/lib/db'
import { tokenContext } from '@/lib/public'
import { unsubscribeByToken } from '@/app/actions/public'
import { UnsubscribeForm } from './UnsubscribeForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'Wiener Labs' }, robots: { index: false, follow: false } }

const text = {
  tr: {
    title: 'E-posta listemizden çıkmak istiyor musunuz?',
    body: (email: string) => `${email} adresine bu konuda bir daha e-posta göndermeyeceğiz. Bu işlem hemen geçerli olur.`,
    confirm: 'Evet, beni listeden çıkarın',
    done: 'Listeden çıkarıldınız. Size bir daha bu konuda yazmayacağız.',
    invalid: 'Bu bağlantı geçerli değil veya süresi dolmuş.',
  },
  en: {
    title: 'Do you want to stop receiving these emails?',
    body: (email: string) => `We will not email ${email} about this again. This takes effect immediately.`,
    confirm: 'Yes, remove me',
    done: 'You have been removed. We will not contact you about this again.',
    invalid: 'This link is not valid or has expired.',
  },
}

function mask(email: string | null): string {
  if (!email) return ''
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

export default async function UnsubscribePage({ params }: PageProps<'/u/[token]'>) {
  const { token } = await params
  const db = await getDb()
  const context = /^[A-Za-z0-9_-]{16,64}$/.test(token) ? await tokenContext(db, token) : null
  const copy = text[context?.language ?? 'tr']
  const already = context?.contact.stage === 'unsubscribed'
  return (
    <div className="light-scope relative flex min-h-screen items-center justify-center px-5">
      <div className="raven-backdrop" aria-hidden />
      <div className="card w-full max-w-lg p-8">
        <div className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
          <Image src="/brand/wiener-mark-256.png" alt="" width={24} height={24} className="h-6 w-6" />
          Wiener Labs
        </div>
        {!context ? (
          <p className="mt-6 text-base text-ink">{copy.invalid}</p>
        ) : already ? (
          <p className="mt-6 text-base text-ink">{copy.done}</p>
        ) : (
          <>
            <h1 className="mt-6 text-2xl tracking-tight text-ink">{copy.title}</h1>
            <p className="mt-2 text-sm text-mute">{copy.body(mask(context.contact.email))}</p>
            <UnsubscribeForm action={unsubscribeByToken.bind(null, token)} confirm={copy.confirm} done={copy.done} />
          </>
        )}
      </div>
    </div>
  )
}
