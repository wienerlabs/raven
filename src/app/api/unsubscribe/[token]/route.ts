import { getDb } from '@/lib/db'
import { unsubscribeToken } from '@/lib/public'

export async function POST(_: Request, context: RouteContext<'/api/unsubscribe/[token]'>) {
  const { token } = await context.params
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response('invalid', { status: 400 })
  const db = await getDb()
  const ok = await unsubscribeToken(db, token, 'one-click')
  return new Response(ok ? 'unsubscribed' : 'not found', { status: ok ? 200 : 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
