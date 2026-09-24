import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Check, MessageCircle, ShieldCheck } from 'lucide-react'
import { getDb } from '@/lib/db'
import { contactBySlug, isTestToken } from '@/lib/public'
import { getSettings } from '@/lib/settings'
import { landingCopy } from '@/lib/landing-copy'
import { formatDate } from '@/lib/labels'
import { isAdmin } from '@/lib/security/session'
import { leaveNote } from '@/app/actions/public'
import { resolveWhatsapp } from '@/lib/whatsapp/config'
import { clickToChatText, waMeLink } from '@/lib/channels/whatsapp'
import { NoteForm } from './NoteForm'
import { ViewBeacon } from './ViewBeacon'

export const dynamic = 'force-dynamic'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('')
}

function tokenFrom(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null
}

export async function generateMetadata({ params }: PageProps<'/r/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const db = await getDb()
  const found = await contactBySlug(db, slug)
  if (!found) return { title: 'Wiener Labs', robots: { index: false, follow: false } }
  const { pitch } = found
  return {
    title: { absolute: `${pitch.landing.headline} · Wiener Labs` },
    description: pitch.landing.subheadline,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title: pitch.landing.headline, description: pitch.landing.subheadline, siteName: 'Wiener Labs', type: 'website' },
    twitter: { card: 'summary_large_image', title: pitch.landing.headline, description: pitch.landing.subheadline },
  }
}

export default async function LandingPage({ params, searchParams }: PageProps<'/r/[slug]'>) {
  const { slug } = await params
  const query = await searchParams
  const db = await getDb()
  const found = await contactBySlug(db, slug)
  if (!found) notFound()
  const { pitch } = found
  const [settings, whatsapp] = await Promise.all([getSettings(db), resolveWhatsapp(db)])
  const copy = landingCopy[pitch.language]
  const token = tokenFrom(query.m)
  const testVisit = await isTestToken(db, token)
  const preview = query.onizleme === '1' || testVisit
  const showPreviewBanner = testVisit || (preview && (await isAdmin()))
  const source = query.s === 'wa' ? 'whatsapp' : 'email'
  const tokenQuery = token ? `&m=${token}` : ''
  const intentHref = (intent: 'meeting' | 'info' | 'later') => `/r/${slug}/yanit?n=${intent}${tokenQuery}${preview ? '&onizleme=1' : ''}`
  const whatsappHref = whatsapp.businessNumber
    ? preview
      ? waMeLink(whatsapp.businessNumber, clickToChatText({ language: pitch.language, company: pitch.company.name, solution: pitch.solution.name, slug }))
      : `/r/${slug}/whatsapp?${token ? `m=${token}&` : ''}s=page`
    : null
  const personName = [pitch.person.firstName, pitch.person.lastName].filter(Boolean).join(' ')
  const sender = settings.sender
  const website = sender.website.replace(/^https?:\/\//, '').replace(/\/+$/, '')

  return (
    <div className="light-scope relative min-h-screen" lang={pitch.language}>
      <div className="raven-backdrop" aria-hidden />
      {showPreviewBanner ? <div className="bg-ink px-5 py-2 text-center text-xs text-surface">{testVisit ? 'Test e-postasından açtınız: ziyaret ve yanıtlar kaydedilmiyor.' : 'Önizleme modu: bu ziyaret kaydedilmiyor.'}</div> : null}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6">
        <div className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
          <Image src="/brand/wiener-mark-256.png" alt="" width={26} height={26} className="h-[26px] w-[26px]" priority />
          {sender.company}
        </div>
        <span className="pill bg-surface/80 backdrop-blur">
          {copy.preparedFor(pitch.company.name)} · {formatDate(new Date())}
        </span>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-20">
        <section className="pb-14 pt-10 sm:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent-soft px-3 py-1 text-xs text-ink">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            {copy.briefLabel}
          </span>
          <h1 className="mt-6 max-w-4xl text-4xl leading-[1.06] tracking-tight text-ink sm:text-5xl lg:text-6xl">{pitch.landing.headline}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-mute">{pitch.landing.subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link href={intentHref('meeting')} className="btn px-6 py-3">
              {copy.meetingCta} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href={intentHref('info')} className="btn-ghost px-6 py-3">
              {copy.infoCta}
            </Link>
            {whatsappHref ? (
              <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn-ghost px-6 py-3">
                <MessageCircle className="h-4 w-4" /> {copy.whatsappCta}
              </a>
            ) : null}
          </div>
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 p-3 backdrop-blur">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-on-accent">{initials(sender.fullName)}</span>
              <span className="min-w-0 text-sm">
                <span className="block text-xs text-mute">{copy.preparedBy}</span>
                <span className="block truncate text-ink">
                  {sender.fullName}, {sender.title}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 p-3 backdrop-blur">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-soft text-sm text-ink">{initials(personName)}</span>
              <span className="min-w-0 text-sm">
                <span className="block text-xs text-mute">{copy.forLabel}</span>
                <span className="block truncate text-ink">
                  {personName}, {pitch.company.name}
                </span>
              </span>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.problemLabel}</h2>
          <p className="max-w-3xl text-2xl leading-[1.45] tracking-tight text-ink">{pitch.solution.problem}</p>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.systemLabel}</h2>
          <div>
            <div className="text-3xl tracking-tight text-ink sm:text-4xl">{pitch.solution.name}</div>
            <p className="mt-3 max-w-2xl text-base leading-7 text-mute">{pitch.solution.tagline}</p>
            <div className="mt-8 text-xs text-mute">{copy.howLabel}</div>
            <ol className="mt-3 grid gap-3 md:grid-cols-3">
              {pitch.solution.steps.map((step, index) => (
                <li key={step.title} className="relative rounded-3xl border border-line bg-surface p-5">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent bg-accent text-xs text-on-accent">{index + 1}</span>
                  <div className="mt-4 text-base text-ink">{step.title}</div>
                  <p className="mt-2 text-sm leading-6 text-mute">{step.detail}</p>
                  {index < pitch.solution.steps.length - 1 ? (
                    <ArrowRight className="absolute -right-[1.1rem] top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-canvas text-mute md:block" aria-hidden />
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.capabilitiesLabel}</h2>
          <ul className="max-w-3xl space-y-4">
            {pitch.solution.capabilities.map((item) => (
              <li key={item} className="flex items-start gap-3 text-lg leading-7 text-ink">
                <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-on-accent">
                  <Check className="h-3 w-3" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.pilotLabel}</h2>
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
            <dl className="space-y-5">
              <div>
                <dt className="text-xs text-mute">{copy.pilotDuration}</dt>
                <dd className="mt-1 text-2xl tracking-tight text-ink">{pitch.solution.pilot.duration}</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">{copy.pilotScope}</dt>
                <dd className="mt-1 text-base leading-7 text-ink">{pitch.solution.pilot.scope}</dd>
              </div>
              <div>
                <dt className="text-xs text-mute">{copy.pilotDeliverable}</dt>
                <dd className="mt-1 text-base leading-7 text-ink">{pitch.solution.pilot.deliverable}</dd>
              </div>
            </dl>
            <div>
              <div className="text-xs text-mute">{copy.kpiLabel}</div>
              <ul className="mt-3 divide-y divide-line rounded-3xl border border-line bg-surface">
                {pitch.solution.kpis.map((kpi, index) => (
                  <li key={kpi} className="flex items-start gap-3 px-5 py-4 text-sm text-ink">
                    <span className="mt-0.5 text-xs text-mute">0{index + 1}</span>
                    {kpi}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.integrationLabel}</h2>
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              {pitch.solution.integrations.map((item) => (
                <span key={item} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink">
                  {item}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-start gap-3 rounded-2xl bg-soft p-4 text-sm leading-6 text-ink">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-mute" aria-label={copy.securityLabel} />
              {pitch.solution.security}
            </div>
          </div>
        </section>

        <section className="grid gap-4 border-t border-line py-12 md:grid-cols-[13rem_1fr]">
          <h2 className="text-sm text-mute">{copy.faqLabel}</h2>
          <div className="max-w-3xl divide-y divide-line border-y border-line">
            {pitch.landing.faq.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base text-ink">
                  {item.q}
                  <span className="text-mute transition group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-mute">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="card mt-4 grid gap-8 p-8 lg:grid-cols-[1fr_1fr]">
          <div>
            <h2 className="text-3xl leading-tight tracking-tight text-ink">{copy.closingTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-mute">{copy.closingBody(sender.firstName)}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {settings.calendarUrl ? (
                <a href={settings.calendarUrl} target="_blank" rel="noreferrer" className="btn px-6 py-3">
                  {copy.calendarCta} <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
              <Link href={intentHref('meeting')} className={settings.calendarUrl ? 'btn-ghost px-6 py-3' : 'btn px-6 py-3'}>
                {copy.meetingCta}
              </Link>
              <Link href={intentHref('info')} className="btn-ghost px-6 py-3">
                {copy.infoCta}
              </Link>
              {whatsappHref ? (
                <a href={whatsappHref} target="_blank" rel="noreferrer" className="btn-ghost px-6 py-3">
                  <MessageCircle className="h-4 w-4" /> {copy.whatsappCta}
                </a>
              ) : null}
            </div>
          </div>
          <NoteForm action={leaveNote.bind(null, slug, token)} language={pitch.language} intent="other" placeholder={copy.notePlaceholder} title={copy.noteTitle} submit={copy.noteSubmit} contactPlaceholder={copy.contactPlaceholder} />
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 text-xs text-mute">
        <span>{copy.footerPersonal(personName)}</span>
        <span className="flex flex-wrap items-center gap-4">
          {website ? (
            <a href={sender.website} target="_blank" rel="noreferrer" className="hover:text-ink">
              {website}
            </a>
          ) : null}
          <Link href="/gizlilik" className="hover:text-ink">
            {copy.privacy}
          </Link>
          {token ? (
            <Link href={`/u/${token}`} className="hover:text-ink">
              {copy.unsubscribe}
            </Link>
          ) : null}
        </span>
      </footer>
      {preview ? null : <ViewBeacon slug={slug} token={token} source={source} />}
    </div>
  )
}
