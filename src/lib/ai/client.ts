import type Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export async function anthropic(): Promise<Anthropic> {
  if (client) return client
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured')
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk')
  client = new AnthropicClient({ apiKey: key, maxRetries: 3, timeout: 120_000 })
  return client
}

export function aiFailure(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : null
  if (status === 401 || status === 403) return 'AI anahtarı geçersiz ya da yetkisiz. ANTHROPIC_API_KEY değerini kontrol edin.'
  if (status === 429) return 'AI kullanım sınırına ulaşıldı. Bir dakika sonra yeniden deneyin.'
  if (status !== null && status >= 500) return 'AI servisi şu an yoğun. Biraz sonra yeniden deneyin.'
  const message = error instanceof Error ? error.message : String(error)
  if (/timed? ?out/i.test(message)) return 'AI yanıtı zaman aşımına uğradı. Yeniden deneyin.'
  if (message.includes('ANTHROPIC_API_KEY')) return 'AI taslak için ANTHROPIC_API_KEY tanımlı olmalı.'
  return 'Taslak üretilemedi. Yeniden deneyin.'
}
