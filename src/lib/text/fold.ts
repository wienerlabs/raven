const turkishFold: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  I: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
}

export function foldTurkish(value: string): string {
  let out = ''
  for (const char of value.normalize('NFC')) out += turkishFold[char] ?? char
  return out
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function foldName(value: string): string {
  return foldTurkish(value)
    .replace(/ue/g, 'u')
    .replace(/oe/g, 'o')
    .replace(/[^a-z]/g, '')
}

export function namesMatch(a: string, b: string): boolean {
  const left = foldName(a)
  const right = foldName(b)
  return left.length > 0 && left === right
}

export function turkishLower(value: string): string {
  return value.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase()
}

export function turkishUpperFirst(value: string): string {
  if (!value) return value
  const first = value[0] === 'i' ? 'İ' : value[0] === 'ı' ? 'I' : value[0].toUpperCase()
  return first + value.slice(1)
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}
