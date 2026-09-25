import { z } from 'zod'
import type { Database } from '@/lib/db'
import { getState, setState } from '@/lib/settings'

export interface Snippet {
  id: string
  title: string
  body: string
}

export interface SnippetValues {
  ad: string
  şirket: string
  çözüm: string
  taslak: string
  takvim: string
  gönderen: string
}

const KEY = 'snippets'
const dashes = new RegExp(`[${String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015, 0x2212)}]`)

export const defaultSnippets: Snippet[] = [
  { id: 'gorusme', title: 'Görüşme saati iste', body: 'Merhaba {ad}, ilginiz için teşekkürler. Bu hafta 20 dakikalık kısa bir görüşme için size uygun iki saat paylaşabilir misiniz? {takvim}' },
  { id: 'detay', title: 'Detayları gönder', body: '{çözüm} için hazırladığımız taslağın tamamı burada: {taslak} Aklınıza takılanı buradan yazabilirsiniz, kısa bir görüşmeyle de anlatabilirim.' },
  { id: 'tesekkur', title: 'Teşekkür et', body: 'Teşekkürler {ad}, notunuzu aldım. En kısa sürede size dönüş yapacağım.' },
  { id: 'sonra', title: 'Şimdilik değil', body: 'Anlıyorum {ad}, zaman ayırdığınız için teşekkürler. Uygun olduğunuzda buradan yazmanız yeterli.' },
  { id: 'kimlik', title: 'Kim olduğunu sor', body: 'Merhaba, {şirket} için hazırladığımız taslak hakkında yazdığınız için teşekkürler. Adınızı ve görevinizi öğrenebilir miyim?' },
]

const snippetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  title: z.string().trim().min(2).max(40),
  body: z.string().trim().min(2).max(1000),
})

export async function getSnippets(db: Database): Promise<Snippet[]> {
  const stored = await getState<{ items?: unknown }>(db, KEY)
  const parsed = z.array(snippetSchema).safeParse(stored?.items)
  return parsed.success && parsed.data.length ? parsed.data : defaultSnippets
}

export type SnippetCheck = { ok: true; items: Snippet[] } | { ok: false; message: string }

export function checkSnippets(items: Array<{ id?: string; title: string; body: string }>): SnippetCheck {
  if (items.length > 20) return { ok: false, message: 'En fazla 20 hazır yanıt kaydedilebilir.' }
  const out: Snippet[] = []
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    const title = item.title.replace(/\s+/g, ' ').trim()
    const body = item.body.replace(/\r\n/g, '\n').trim()
    if (!title && !body) continue
    if (title.length < 2 || title.length > 40) return { ok: false, message: `${index + 1}. yanıtın başlığı 2 ile 40 karakter arasında olmalı.` }
    if (body.length < 2 || body.length > 1000) return { ok: false, message: `"${title}" metni 2 ile 1000 karakter arasında olmalı.` }
    if (dashes.test(body) || dashes.test(title)) return { ok: false, message: `"${title}" içinde uzun tire var; virgül ya da nokta kullanın.` }
    let id = (item.id && /^[a-z0-9-]{1,40}$/.test(item.id) ? item.id : '') || `y${index + 1}`
    while (seen.has(id)) id = `${id}-${index + 1}`
    seen.add(id)
    out.push({ id, title, body })
  }
  return { ok: true, items: out }
}

export async function saveSnippets(db: Database, items: Snippet[]): Promise<void> {
  await setState(db, KEY, { items })
}

export function renderSnippet(body: string, values: Partial<SnippetValues>): string {
  const filled = body.replace(/\{([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\}/g, (_, key: string) => {
    const value = values[key.toLocaleLowerCase('tr') as keyof SnippetValues]
    return value ? value : ''
  })
  return filled
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
