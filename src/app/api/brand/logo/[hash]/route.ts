import { getDb } from '@/lib/db'
import { currentLogoBytes } from '@/lib/brand/logo'

export async function GET(request: Request, { params }: RouteContext<'/api/brand/logo/[hash]'>) {
  const { hash } = await params
  const db = await getDb()
  const logo = await currentLogoBytes(db)
  if (!logo) return Response.redirect(new URL('/brand/wiener-mark-email.png', request.url), 302)
  const exact = logo.hash === hash
  return new Response(Buffer.from(logo.bytes), {
    headers: {
      'content-type': logo.contentType,
      'cache-control': exact ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
      'cross-origin-resource-policy': 'cross-origin',
    },
  })
}
