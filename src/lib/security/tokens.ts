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

export interface SessionSubject {
  sub: string
  name: string
}

export interface SessionPayload extends SessionSubject {
  exp: number
}

const passwordSubject: SessionSubject = { sub: 'password', name: 'Yönetici' }

export function createSessionValue(secret: string, ttlSeconds: number, now = Date.now(), subject: SessionSubject = passwordSubject): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + ttlSeconds, v: 2, sub: subject.sub, name: subject.name })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function readSessionValue(value: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!value) return null
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  if (!safeEqual(signature, sign(payload, secret))) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown; sub?: unknown; name?: unknown }
    if (typeof data.exp !== 'number' || data.exp * 1000 <= now) return null
    return {
      exp: data.exp,
      sub: typeof data.sub === 'string' ? data.sub : passwordSubject.sub,
      name: typeof data.name === 'string' ? data.name : passwordSubject.name,
    }
  } catch {
    return null
  }
}

export function verifySessionValue(value: string | undefined, secret: string, now = Date.now()): boolean {
  return readSessionValue(value, secret, now) !== null
}

export function hashForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
