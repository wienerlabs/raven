import { createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto'

const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url')
}

export function randomSlug(length = 10): string {
  const bytes = randomBytes(length * 2)
  let out = ''
  for (let index = 0; index < bytes.length && out.length < length; index++) {
    const value = bytes[index]
    if (value < 248) out += base62[value % 62]
  }
  return out.length === length ? out : randomSlug(length)
}

export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest()
  const right = createHash('sha256').update(b).digest()
  return timingSafeEqual(left, right)
}

export function createSessionValue(secret: string, ttlSeconds: number, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + ttlSeconds, v: 1 })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifySessionValue(value: string | undefined, secret: string, now = Date.now()): boolean {
  if (!value) return false
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return false
  if (!safeEqual(signature, sign(payload, secret))) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number }
    return typeof data.exp === 'number' && data.exp * 1000 > now
  } catch {
    return false
  }
}

export function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
