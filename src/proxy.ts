import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/security/cookie-name'
import { verifySessionValue } from '@/lib/security/tokens'
import { sessionSecret } from '@/lib/env'

const publicPrefixes = ['/giris', '/r/', '/u/', '/gizlilik', '/api/track', '/api/unsubscribe', '/api/webhooks', '/api/cron', '/api/health', '/brand/', '/fonts/', '/bg/']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (publicPrefixes.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix))) return NextResponse.next()
  let valid = false
  try {
    valid = verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret())
  } catch {
    valid = false
  }
  if (valid) return NextResponse.next()
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = request.nextUrl.clone()
  url.pathname = '/giris'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt).*)'],
}
