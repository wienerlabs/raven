const plainAddress = /^[^\s@?&#%<>"'\\/:;,()[\]]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

export function mailtoHref(email: string | null | undefined, fields: { subject?: string; body?: string } = {}): string | null {
  const to = email?.trim() ?? ''
  if (!plainAddress.test(to)) return null
  const query = (['subject', 'body'] as const)
    .filter((key) => fields[key])
    .map((key) => `${key}=${encodeURIComponent(fields[key] as string)}`)
    .join('&')
  return `mailto:${to}${query ? `?${query}` : ''}`
}
