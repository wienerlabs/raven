'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { FileUp, Inbox, LayoutDashboard, LogOut, MessageCircle, PanelLeftClose, PanelLeftOpen, Send, Settings, Users } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { RavenBadge } from '@/components/brand/RavenMark'
import { WienerCredit, WienerMark } from '@/components/brand/WienerMark'
import { ThemeToggle } from './ThemeToggle'
import { CommandPalette } from './CommandPalette'

interface Item {
  href: string
  label: string
  icon: typeof LayoutDashboard
  badge?: number
}

const SIDEBAR_KEY = 'raven.sidebar'

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

function NavItem({ item, collapsed, pathname }: { item: Item; collapsed: boolean; pathname: string }) {
  const Icon = item.icon
  const active = isActive(pathname, item.href)
  return (
    <Link href={item.href} title={collapsed ? item.label : undefined} prefetch>
      <motion.span
        whileHover={{ x: collapsed ? 0 : 2 }}
        whileTap={{ scale: 0.98 }}
        className={
          'flex items-center gap-3 rounded-2xl py-2.5 text-sm transition ' +
          (collapsed ? 'justify-center px-0' : 'px-3 ') +
          (active ? 'bg-accent text-on-accent' : 'text-mute hover:bg-soft hover:text-ink')
        }
      >
        <Icon className="h-4 w-4 shrink-0" />
        {collapsed ? null : <span className="flex-1">{item.label}</span>}
        {!collapsed && item.badge ? <span className={'rounded-full px-2 text-xs ' + (active ? 'bg-surface/70 text-ink' : 'bg-accent text-on-accent')}>{item.badge}</span> : null}
      </motion.span>
    </Link>
  )
}

export function Shell({ children, inboxCount, whatsappCount, tagline, viewer }: { children: ReactNode; inboxCount: number; whatsappCount: number; tagline: string; viewer: string | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const wide = isActive(pathname, '/whatsapp')

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'collapsed')
    } catch {
      setCollapsed(false)
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded')
      } catch {
        return next
      }
      return next
    })
  }

  const main: Item[] = [
    { href: '/', label: 'Panel', icon: LayoutDashboard },
    { href: '/kisiler', label: 'Kişiler', icon: Users },
    { href: '/kampanya', label: 'Kampanya', icon: Send },
    { href: '/yanitlar', label: 'Yanıtlar', icon: Inbox, badge: inboxCount },
    { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, badge: whatsappCount },
  ]
  const tools: Item[] = [
    { href: '/ice-aktar', label: 'İçe aktar', icon: FileUp },
    { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
  ]

  return (
    <div className="min-h-screen text-ink">
      <aside
        className={
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface/85 py-6 backdrop-blur transition-[width,padding] duration-200 lg:flex ' +
          (collapsed ? 'w-[4.5rem] px-2' : 'w-60 px-4')
        }
      >
        <Link href="/" className={'flex items-center gap-2.5 text-xl tracking-tight text-ink ' + (collapsed ? 'justify-center px-0' : 'px-3')} title="Raven">
          <RavenBadge className="h-8 w-8" />
          {collapsed ? null : 'Raven'}
        </Link>
        <div className="mt-8 space-y-1">
          {main.map((item) => (
            <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </div>
        {collapsed ? <div className="mx-auto mt-6 h-px w-8 bg-line" /> : <div className="mt-8 px-3 text-xs text-mute">Araçlar</div>}
        <div className="mt-2 space-y-1">
          {tools.map((item) => (
            <NavItem key={item.href} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </div>
        <div className={'mt-auto space-y-2 ' + (collapsed ? 'px-0' : 'px-3')}>
          {collapsed ? <div className="flex justify-center py-1"><WienerMark size={14} /></div> : <WienerCredit className="px-0 py-1" />}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            className={'flex items-center gap-2 rounded-2xl py-2 text-xs text-mute transition hover:bg-soft hover:text-ink ' + (collapsed ? 'w-full justify-center' : 'px-3')}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {collapsed ? null : 'Menüyü daralt'}
          </button>
        </div>
      </aside>

      <div className={'transition-[padding] duration-200 ' + (collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-60')}>
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/80 px-5 py-3 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 text-lg tracking-tight text-ink lg:hidden">
            <RavenBadge className="h-7 w-7" />
            Raven
          </Link>
          <div className="hidden items-center gap-3 text-sm text-mute lg:flex">
            <span>{tagline}</span>
          </div>
          <div className="flex items-center gap-2">
            <CommandPalette />
            {viewer ? <span className="hidden text-xs text-mute md:inline">{viewer}</span> : null}
            <ThemeToggle />
            <form action={logout}>
              <motion.button
                type="submit"
                whileTap={{ scale: 0.94 }}
                title="Çıkış yap"
                aria-label="Çıkış yap"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-mute transition hover:border-accent-strong hover:text-ink"
              >
                <LogOut className="h-3.5 w-3.5" /> Çıkış
              </motion.button>
            </form>
          </div>
        </header>
        <main className={'mx-auto w-full px-5 pb-28 pt-6 lg:pb-16 ' + (wide ? 'max-w-[92rem]' : 'max-w-6xl')}>{children}</main>
        <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-5 text-xs text-mute">
          <span className="inline-flex items-center gap-2">
            <WienerMark size={14} />
            Raven, Wiener Labs için kişiye özel çözüm ve iletişim motoru
          </span>
          <span>Gönderimler mesai saatlerinde, kademeli ilerler</span>
        </footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-line bg-surface/95 px-2 py-2 backdrop-blur lg:hidden">
        {[...main, tools[1]].map((item) => {
          const Icon = item.icon
          const active = isActive(pathname, item.href)
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <span className={'flex flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] ' + (active ? 'text-ink' : 'text-mute')}>
                <span className={'inline-flex h-7 w-7 items-center justify-center rounded-full ' + (active ? 'bg-accent text-on-accent' : '')}>
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
