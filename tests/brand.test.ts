import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '@/lib/db'
import { checkLogo, currentLogoBytes, getBrand, logoBox, removeLogo, saveLogo, setShowCompanyName, sniffImage } from '@/lib/brand/logo'
import { getAuthPolicy, passwordLoginAllowed, setPasswordLogin } from '@/lib/auth/policy'
import { renderEmail } from '@/lib/email/render'
import { defaultSettings } from '@/lib/settings'
import { openTestDb, type TestDatabase } from './db'
import { pitchFor } from './fixtures'

function png(width: number, height: number, padding = 0): Uint8Array {
  const bytes = new Uint8Array(33 + padding)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes.set([8, 6, 0, 0, 0], 24)
  return bytes
}

function jpeg(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9])
}

const base = { contact: { slug: 'AbCdE12345', company: 'Rotaport' }, settings: defaultSettings, baseUrl: 'https://raven.example.com', replyTo: 'baturalp@wienerlabs.test', pitch: pitchFor('Mert', 'Rotaport'), message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' as const } }

describe('email logo files', () => {
  it('reads real dimensions from PNG and JPEG headers', () => {
    expect(sniffImage(png(512, 128))).toEqual({ contentType: 'image/png', width: 512, height: 128 })
    expect(sniffImage(jpeg(640, 160))).toEqual({ contentType: 'image/jpeg', width: 640, height: 160 })
    expect(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBeNull()
  })

  it('accepts clean logos and explains every rejection', () => {
    expect(checkLogo(png(512, 128)).ok).toBe(true)
    expect(checkLogo(new Uint8Array())).toMatchObject({ ok: false })
    expect(checkLogo(png(30, 20))).toMatchObject({ ok: false })
    expect(checkLogo(png(512, 128, 600 * 1024))).toMatchObject({ ok: false, message: 'Logo en fazla 512 KB olabilir.' })
    expect(checkLogo(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toMatchObject({ ok: false })
  })

  it('fits wide and square logos into the email header', () => {
    expect(logoBox({ width: 512, height: 128 })).toEqual({ width: 112, height: 28 })
    expect(logoBox({ width: 1200, height: 100 })).toEqual({ width: 220, height: 18 })
    expect(logoBox({ width: 256, height: 256 })).toEqual({ width: 28, height: 28 })
  })

  it('renders the uploaded logo with fixed dimensions and falls back to the default mark', () => {
    const logo = { hash: 'abcdef0123456789', contentType: 'image/png' as const, width: 512, height: 128, size: 2048, updatedAt: '2026-09-24T00:00:00Z' }
    const withLogo = renderEmail({ ...base, brand: { logo, showCompanyName: false } })
    expect(withLogo.html).toContain('src="https://raven.example.com/api/brand/logo/abcdef0123456789" width="112" height="28" alt="Wiener Labs"')
    expect(withLogo.html).not.toContain('wiener-mark-email.png')
    const withName = renderEmail({ ...base, brand: { logo, showCompanyName: true } })
    expect(withName.html).toMatch(/api\/brand\/logo\/abcdef0123456789[^>]+><span[^>]*>Wiener Labs<\/span>/)
    const fallback = renderEmail(base)
    expect(fallback.html).toContain('https://raven.example.com/brand/wiener-mark-email.png')
  })
})

describe('stored brand and sign in policy', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  it('stores, serves and removes the logo', async () => {
    const bytes = png(512, 128)
    const check = checkLogo(bytes)
    if (!check.ok) throw new Error(check.message)
    const logo = await saveLogo(db, bytes, check.image)
    expect((await getBrand(db)).logo).toMatchObject({ hash: logo.hash, width: 512, height: 128, contentType: 'image/png' })
    const served = await currentLogoBytes(db)
    expect(served?.hash).toBe(logo.hash)
    expect(Array.from(served?.bytes ?? [])).toEqual(Array.from(bytes))
    await setShowCompanyName(db, false)
    expect((await getBrand(db)).showCompanyName).toBe(false)
    await removeLogo(db)
    expect((await getBrand(db)).logo).toBeNull()
    expect(await currentLogoBytes(db)).toBeNull()
  })

  it('locks sign in to passkeys without ever locking everyone out', async () => {
    expect(await getAuthPolicy(db)).toEqual({ passwordLogin: true })
    await setPasswordLogin(db, false)
    const policy = await getAuthPolicy(db)
    expect(passwordLoginAllowed(policy, true, {} as NodeJS.ProcessEnv)).toBe(false)
    expect(passwordLoginAllowed(policy, false, {} as NodeJS.ProcessEnv)).toBe(true)
    expect(passwordLoginAllowed(policy, true, { RAVEN_PASSWORD_LOGIN: 'force' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(passwordLoginAllowed({ passwordLogin: true }, true, {} as NodeJS.ProcessEnv)).toBe(true)
  })
})
