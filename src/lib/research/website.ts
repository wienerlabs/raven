import { lookup, resolveMx } from 'node:dns/promises'
import { isIP } from 'node:net'

export interface WebsiteSnapshot {
  url: string | null
  title: string | null
  description: string | null
  excerpt: string | null
  error: string | null
}

export const freeMailDomains = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'yandex.com', 'yandex.ru', 'mail.ru', 'proton.me', 'protonmail.com', 'msn.com', 'aol.com', 'gmx.com', 'hotmail.com.tr', 'windowslive.com'])

const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' }

function decodeEntities(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (match) => entities[match] ?? match)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
}

function metaContent(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1]) return decodeEntities(match[1]).trim()
  }
  return null
}

export function extractSnapshot(html: string, url: string): WebsiteSnapshot {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const description = metaContent(html, 'description') ?? metaContent(html, 'og:description')
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  const excerpt = decodeEntities(body).replace(/\s+/g, ' ').trim().slice(0, 2400)
  return {
    url,
    title: title ? decodeEntities(title).replace(/\s+/g, ' ').trim().slice(0, 200) : null,
    description: description ? description.slice(0, 400) : null,
    excerpt: excerpt || null,
    error: null,
  }
}

export function isPublicDomain(domain: string): boolean {
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) return false
  return !/(^|\.)(localhost|local|internal|lan|home|corp|arpa)$/i.test(domain)
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19))
  }
  if (family === 6) {
    const lower = address.toLowerCase()
    if (lower === '::' || lower === '::1') return true
    if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower)
  }
  return true
}

async function hostIsPublic(hostname: string): Promise<boolean> {
  if (isIP(hostname) || !isPublicDomain(hostname)) return false
  try {
    const records = await lookup(hostname, { all: true, verbatim: true })
    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address))
  } catch {
    return false
  }
}

async function readLimited(response: Response, limit: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < limit) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.byteLength
  }
  await reader.cancel().catch(() => undefined)
  const merged = new Uint8Array(Math.min(size, limit))
  let offset = 0
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.max(0, merged.length - offset))
    merged.set(slice, offset)
    offset += slice.byteLength
    if (offset >= merged.length) break
  }
  return new TextDecoder('utf-8').decode(merged)
}

const MAX_REDIRECTS = 4
const MAX_BYTES = 1_500_000

async function fetchPublicHtml(start: string, timeoutMs: number): Promise<{ html: string; url: string } | { error: string }> {
  let current = new URL(start)
  const deadline = AbortSignal.timeout(timeoutMs)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:' && current.protocol !== 'http:') return { error: 'unsupported protocol' }
    if (current.port && current.port !== '80' && current.port !== '443') return { error: 'unsupported port' }
    if (!(await hostIsPublic(current.hostname))) return { error: 'host is not public' }
    const response = await fetch(current, {
      redirect: 'manual',
      signal: deadline,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; RavenResearch/1.0; +https://wienerlabs.xyz)', accept: 'text/html,application/xhtml+xml' },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => undefined)
      if (!location) return { error: `HTTP ${response.status} without location` }
      current = new URL(location, current)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return { error: `HTTP ${response.status}` }
    }
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('html')) {
      await response.body?.cancel().catch(() => undefined)
      return { error: `unexpected content type ${type}` }
    }
    return { html: await readLimited(response, MAX_BYTES), url: current.toString() }
  }
  return { error: 'too many redirects' }
}

export async function fetchWebsite(domain: string, timeoutMs = 9000): Promise<WebsiteSnapshot> {
  if (!isPublicDomain(domain)) return { url: null, title: null, description: null, excerpt: null, error: 'invalid domain' }
  let lastError = 'unreachable'
  for (const url of [`https://${domain}`, `https://www.${domain}`]) {
    try {
      const outcome = await fetchPublicHtml(url, timeoutMs)
      if ('html' in outcome) return extractSnapshot(outcome.html, outcome.url)
      lastError = outcome.error
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { url: null, title: null, description: null, excerpt: null, error: lastError }
}

export async function lookupMx(domain: string): Promise<{ ok: boolean; hosts: string[] }> {
  try {
    const records = await resolveMx(domain)
    const hosts = records.sort((a, b) => a.priority - b.priority).map((record) => record.exchange).filter(Boolean)
    return { ok: hosts.length > 0, hosts }
  } catch {
    return { ok: false, hosts: [] }
  }
}
