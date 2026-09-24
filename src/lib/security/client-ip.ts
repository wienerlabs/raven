import { headers } from 'next/headers'

export async function clientIp(): Promise<string> {
  const list = await headers()
  return list.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip')?.trim() || list.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

export async function clientUserAgent(): Promise<string | null> {
  const list = await headers()
  return list.get('user-agent')
}
