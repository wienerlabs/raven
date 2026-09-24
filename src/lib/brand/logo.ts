import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import { getState, setState } from '@/lib/settings'

export const LOGO_MAX_BYTES = 512 * 1024
export const LOGO_DISPLAY_HEIGHT = 28
export const LOGO_DISPLAY_MAX_WIDTH = 220

const logoSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{16}$/),
  contentType: z.enum(['image/png', 'image/jpeg']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  size: z.number().int().positive(),
  updatedAt: z.string(),
})

const brandSchema = z.object({
  logo: logoSchema.nullable().default(null),
  showCompanyName: z.boolean().default(true),
})

export type EmailLogo = z.infer<typeof logoSchema>
export type BrandSettings = z.infer<typeof brandSchema>

const META_KEY = 'brand'
const DATA_KEY = 'brand_logo_data'

export interface SniffedImage {
  contentType: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

function uint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function uint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length >= 24 && pngSignature.every((value, index) => bytes[index] === value)) {
    if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null
    return { contentType: 'image/png', width: uint32(bytes, 16), height: uint32(bytes, 20) }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null
      const marker = bytes[offset + 1]
      if (marker === 0xff) {
        offset += 1
        continue
      }
      if (startOfFrame.has(marker)) return { contentType: 'image/jpeg', height: uint16(bytes, offset + 5), width: uint16(bytes, offset + 7) }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }
      offset += 2 + uint16(bytes, offset + 2)
    }
  }
  return null
}

export type LogoCheck = { ok: true; image: SniffedImage } | { ok: false; message: string }

export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, message: 'Dosya boş.' }
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, message: 'Logo en fazla 512 KB olabilir.' }
  const image = sniffImage(bytes)
  if (!image) return { ok: false, message: "Yalnızca PNG veya JPG yükleyin. SVG ve WebP, Gmail ile Outlook'ta görünmediği için kabul edilmiyor." }
  if (image.height < 40 || image.width < 40) return { ok: false, message: 'Logo çok küçük. En az 40 piksel olmalı; net görünmesi için 56 piksel ve üzeri önerilir.' }
  if (image.width > 4000 || image.height > 4000) return { ok: false, message: 'Logo 4000 pikselden büyük olamaz.' }
  return { ok: true, image }
}

export function logoBox(logo: Pick<EmailLogo, 'width' | 'height'>, height = LOGO_DISPLAY_HEIGHT, maxWidth = LOGO_DISPLAY_MAX_WIDTH): { width: number; height: number } {
  const ratio = logo.width / logo.height
  const width = Math.round(height * ratio)
  if (width <= maxWidth) return { width, height }
  return { width: maxWidth, height: Math.max(1, Math.round(maxWidth / ratio)) }
}

export function logoPath(logo: Pick<EmailLogo, 'hash'>): string {
  return `/api/brand/logo/${logo.hash}`
}

export async function getBrand(db: Database): Promise<BrandSettings> {
  const parsed = brandSchema.safeParse((await getState<unknown>(db, META_KEY)) ?? {})
  return parsed.success ? parsed.data : brandSchema.parse({})
}

export async function saveLogo(db: Database, bytes: Uint8Array, image: SniffedImage, now = new Date()): Promise<EmailLogo> {
  const logo: EmailLogo = {
    hash: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    contentType: image.contentType,
    width: image.width,
    height: image.height,
    size: bytes.length,
    updatedAt: now.toISOString(),
  }
  await setState(db, DATA_KEY, { hash: logo.hash, data: Buffer.from(bytes).toString('base64') })
  const current = await getBrand(db)
  await setState(db, META_KEY, { ...current, logo })
  return logo
}

export async function removeLogo(db: Database): Promise<void> {
  const current = await getBrand(db)
  await setState(db, META_KEY, { ...current, logo: null })
  await setState(db, DATA_KEY, { hash: null, data: null })
}

export async function setShowCompanyName(db: Database, value: boolean): Promise<void> {
  const current = await getBrand(db)
  await setState(db, META_KEY, { ...current, showCompanyName: value })
}

export async function currentLogoBytes(db: Database): Promise<{ hash: string; bytes: Uint8Array; contentType: EmailLogo['contentType'] } | null> {
  const brand = await getBrand(db)
  if (!brand.logo) return null
  const stored = await getState<{ hash: string | null; data: string | null }>(db, DATA_KEY)
  if (!stored?.data || stored.hash !== brand.logo.hash) return null
  return { hash: brand.logo.hash, bytes: new Uint8Array(Buffer.from(stored.data, 'base64')), contentType: brand.logo.contentType }
}
