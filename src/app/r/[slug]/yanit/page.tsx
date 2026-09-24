import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getDb } from '@/lib/db'
import { contactBySlug, isTestToken } from '@/lib/public'
import { getSettings } from '@/lib/settings'
import { getBrand } from '@/lib/brand/logo'
import { BrandMark } from '@/components/brand/BrandMark'
import { landingCopy } from '@/lib/landing-copy'
import { leaveNote } from '@/app/actions/public'
import { IntentConfirm } from './IntentConfirm'
import { NoteForm } from '../NoteForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: { absolute: 'Wiener Labs' }, robots: { index: false, follow: false } }

const intents = ['meeting', 'info', 'later'] as const

export default async function IntentPage({ params, searchParams }: PageProps<'/r/[slug]/yanit'>) {
  const { slug } = await params
  const query = await searchParams
  const intent = intents.find((item) => item === query.n)
  if (!intent) notFound()
  const db = await getDb()
  const found = await contactBySlug(db, slug)
  if (!found) notFound()
  const { pitch } = found
  const [settings, brand] = await Promise.all([getSettings(db), getBrand(db)])
  const copy = landingCopy[pitch.language]
  const token = typeof query.m === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(query.m) ? query.m : null
  const testVisit = await isTestToken(db, token)
  const preview = query.onizleme === '1' || testVisit
  const back = `/r/${slug}${token ? `?m=${token}` : ''}${preview ? `${token ? '&' : '?'}onizleme=1` : ''}`
  const notePlaceholder = intent === 'meeting' ? copy.slotsPlaceholder : intent === 'info' ? copy.infoPlaceholder : copy.referralPlaceholder

  return (
    <div className="light-scope relative flex min-h-screen flex-col" lang={pitch.language}>
      <div className="raven-backdrop" aria-hidden />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-6">
        <BrandMark brand={brand} company={settings.sender.company} />
        <Link href={back} className="chip">
          <ArrowLeft className="h-3 w-3" /> {copy.backToBrief}
        </Link>
      </header>
      {testVisit ? <div className="bg-ink px-5 py-2 text-center text-xs text-surface">Test e-postasından açtınız: bu yanıt kaydedilmiyor.</div> : null}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 pb-20">
        <div className="card p-8 sm:p-10">
          <IntentConfirm slug={slug} token={token} intent={intent} preview={preview} savedLabel={copy.saved} />
          <h1 className="mt-5 text-4xl leading-tight tracking-tight text-ink">{copy.intentTitles[intent]}</h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-mute">{copy.intentBodies[intent](settings.sender.firstName)}</p>
          {intent === 'meeting' && settings.calendarUrl ? (
            <a href={settings.calendarUrl} target="_blank" rel="noreferrer" className="btn mt-6 px-6 py-3">
              {copy.calendarCta} <ArrowRight className="h-4 w-4" />
            </a>
          ) : null}
          <div className="mt-8 border-t border-line pt-6">
            <NoteForm
              action={leaveNote.bind(null, slug, token)}
              language={pitch.language}
              intent={intent}
              placeholder={notePlaceholder}
              title={copy.noteTitle}
              submit={copy.noteSubmit}
              contactPlaceholder={copy.contactPlaceholder}
            />
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-mute">{pitch.solution.name}</p>
      </main>
    </div>
  )
}
