import { resolveMx } from 'node:dns/promises'

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
  return !/(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(domain)
}

export async function fetchWebsite(domain: string, timeoutMs = 9000): Promise<WebsiteSnapshot> {
  if (!isPublicDomain(domain)) return { url: null, title: null, description: null, excerpt: null, error: 'invalid domain' }
  const candidates = [`https://${domain}`, `https://www.${domain}`]
  let lastError = 'unreachable'
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; RavenResearch/1.0; +https://wienerlabs.xyz)', accept: 'text/html,application/xhtml+xml' },
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        continue
      }
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('html')) {
        lastError = `unexpected content type ${type}`
        continue
      }
      const html = (await response.text()).slice(0, 1_500_000)
      return extractSnapshot(html, response.url || url)
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
