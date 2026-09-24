import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { sessionSecret } from '@/lib/env'

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'raven', 'settings-secrets-v1', 32))
}

export function sealSecret(plain: string, secret = sessionSecret()): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), body.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

export function openSecret(sealed: string | null | undefined, secret = sessionSecret()): string | null {
  if (!sealed) return null
  const [version, iv, body, tag] = sealed.split('.')
  if (version !== 'v1' || !iv || !body || !tag) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
