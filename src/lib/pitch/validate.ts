import { foldTurkish, namesMatch, wordCount } from '@/lib/text/fold'
import { pitchSchema, type Pitch } from './schema'

export interface PitchContext {
  firstName: string
  lastName: string
  email: string | null
  company: string
}

export interface PitchCheck {
  ok: boolean
  errors: string[]
  warnings: string[]
  pitch: Pitch | null
}

export const knownFlags = [
  'name-from-email',
  'name-uncertain',
  'company-uncertain',
  'generic-mailbox',
  'email-name-mismatch',
  'title-missing',
  'crypto-company',
  'sanctions-review',
  'jurisdiction-review',
] as const

const dashPattern = /[‒–—―−]/
const emojiPattern = /\p{Extended_Pictographic}/u
const placeholderPattern = /\[[^\]]{2,40}\]|lorem ipsum|\{\{|\}\}/i
const greetingOpeners = /^(merhaba|sayın|hi|hello|dear|selam)\b/i
const honorifics = /(^|[\s,])(bey|hanım|hanim|mr\.?|mrs\.?|ms\.?|miss|sir|madam)(?=$|[\s,.])/i

const spamStems = [
  'ücretsiz',
  'bedava',
  'fırsat',
  'kaçırma',
  'garanti',
  'son şans',
  'indirim',
  'hemen tıkla',
  'tıklayın',
  'acele',
  'sınırlı süre',
  'free',
  'guarantee',
  'act now',
  'limited time',
  'click here',
  'urgent',
  'risk-free',
  'no cost',
  'winner',
]

const cryptoStems = ['kripto', 'crypto', 'blockchain', 'blokzincir', 'web3', 'nft', 'defi', 'bitcoin', 'stablecoin', 'altcoin', 'akıllı sözleşme', 'smart contract', 'tokenizasyon', 'tokenization']

const acronymAllowlist = new Set(
  'KVKK GDPR MASAK BDDK SPK SGK HBYS PACS SCADA SIEM LLM RAG CRM ERP API WMS TMS OMS PIM SAP OCR KYC KYB AML SLA KPI OKR B2B B2C IOT OEE MES PLC GPU CPU SEO UX UI QA SOC EDR DLP IAM SSO PDF XML JSON SQL NLP EHR ETA IVR CTI POS ATM EFT FAST IBAN KDV GIB GİB ISO HR IK İK BT AR-GE ARGE CTO CIO CDO CEO COO CFO DSP DMP SSP CDP CDN VOD OTT ASR TTS LIMS ERP'.split(
    ' ',
  ),
)

function stemRegex(stem: string): RegExp {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}`, 'iu')
}

const spamRegexes = spamStems.map((stem) => ({ stem, regex: stemRegex(stem) }))
const cryptoRegexes = cryptoStems.map((stem) => ({ stem, regex: stemRegex(stem) }))

function collectStrings(value: unknown, path: string, out: Array<{ path: string; text: string }>): void {
  if (typeof value === 'string') {
    out.push({ path, text: value })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, path ? `${path}.${key}` : key, out)
  }
}

function capsWords(text: string): string[] {
  const words = text.match(/[\p{Lu}][\p{Lu}\p{N}-]{4,}/gu) ?? []
  return words.filter((word) => !acronymAllowlist.has(word))
}

function sentencesWithUnhedgedNumbers(text: string): string[] {
  const sentences = text.split(/(?<=[.?])\s+/)
  return sentences.filter((sentence) => {
    const hasNumberClaim = /(%\s?\d+|\d+\s?%|\d+\s?kat\b|\d+x\b|\d+\s?times\b)/i.test(sentence)
    const hedged = /(hedef|ölç|pilot|target|measure|aim|goal|tahmin|estimate)/i.test(sentence)
    return hasNumberClaim && !hedged
  })
}

export function checkPitch(input: unknown, context: PitchContext): PitchCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const parsed = pitchSchema.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`schema ${issue.path.join('.')}: ${issue.message}`)
    return { ok: false, errors, warnings, pitch: null }
  }
  const pitch = parsed.data
  const strings: Array<{ path: string; text: string }> = []
  collectStrings({ ...pitch, flags: undefined }, '', strings)

  const brandWords = new Set(
    [pitch.company.name, context.company, ...pitch.solution.integrations, pitch.solution.name]
      .join(' ')
      .split(/[^\p{L}\p{N}-]+/u)
      .filter(Boolean),
  )

  for (const { path, text } of strings) {
    if (dashPattern.test(text)) errors.push(`${path}: em dash or en dash is not allowed`)
    if (emojiPattern.test(text)) errors.push(`${path}: emoji is not allowed`)
    if (text.includes('!')) errors.push(`${path}: exclamation mark is not allowed`)
    if (placeholderPattern.test(text)) errors.push(`${path}: placeholder text found`)
    for (const { stem, regex } of spamRegexes) if (regex.test(text)) errors.push(`${path}: spam trigger "${stem}"`)
    const caps = capsWords(text).filter((word) => !brandWords.has(word))
    if (caps.length > 0) warnings.push(`${path}: all caps words ${caps.join(', ')}`)
    if (/https?:\/\/|www\./i.test(text)) errors.push(`${path}: raw links are not allowed, the renderer adds links`)
  }

  const solutionText = [pitch.solution.name, pitch.solution.tagline, ...pitch.solution.capabilities, ...pitch.solution.steps.map((step) => `${step.title} ${step.detail}`), pitch.landing.headline].join(' ')
  for (const { stem, regex } of cryptoRegexes) if (regex.test(solutionText)) errors.push(`solution: crypto or blockchain solution is not allowed ("${stem}")`)

  const fromEmail = pitch.flags.includes('name-from-email')
  if (!fromEmail && !namesMatch(pitch.person.firstName, context.firstName)) {
    errors.push(`person.firstName "${pitch.person.firstName}" does not match "${context.firstName}" (add flag name-from-email only when the email shows the used name)`)
  }
  if (context.lastName && pitch.person.lastName && !fromEmail && !namesMatch(pitch.person.lastName, context.lastName)) {
    warnings.push(`person.lastName "${pitch.person.lastName}" differs from "${context.lastName}"`)
  }
  if (!pitch.person.salutation.includes(pitch.person.greetingName)) errors.push('person.salutation must contain greetingName')
  if (honorifics.test(pitch.person.salutation)) errors.push('person.salutation must not use gendered honorifics')
  const opener = pitch.language === 'tr' ? /^(Merhaba|Sayın) / : /^(Hi|Hello|Dear) /
  if (!opener.test(pitch.person.salutation)) errors.push(`person.salutation must start with ${pitch.language === 'tr' ? '"Merhaba " or "Sayın "' : '"Hi ", "Hello " or "Dear "'}`)
  if (!/,$/.test(pitch.person.salutation)) errors.push('person.salutation must end with a comma')

  for (const [index, followUp] of pitch.followUps.entries()) {
    if (greetingOpeners.test(followUp.body.trim())) errors.push(`followUps[${index}]: do not start with a greeting, the renderer adds it`)
  }
  for (const field of ['subject', 'subjectAlt'] as const) {
    if (/^(re|fw|fwd|ynt|ilt)\s*:/i.test(pitch.email[field])) errors.push(`email.${field}: reply or forward prefixes are deceptive`)
  }
  if (pitch.email.subject === pitch.email.subjectAlt) errors.push('email.subjectAlt must differ from subject')

  const linkCount = pitch.whatsapp.split('{link}').length - 1
  if (linkCount !== 1) errors.push('whatsapp must contain {link} exactly once')
  if (greetingOpeners.test(pitch.email.opening.trim())) errors.push('email.opening must not repeat the greeting')

  const words = wordCount(`${pitch.email.opening} ${pitch.email.body}`)
  if (words < 45 || words > 150) warnings.push(`email opening and body have ${words} words, target 60 to 130`)
  if (pitch.email.body.split(/\n\s*\n/).length > 3) warnings.push('email.body has more than 3 paragraphs')

  const emailText = [pitch.email.opening, pitch.email.body, pitch.email.cta, pitch.email.ps, pitch.landing.subheadline].join(' ')
  for (const sentence of sentencesWithUnhedgedNumbers(emailText)) warnings.push(`unhedged number claim: "${sentence.slice(0, 90)}"`)
  if (/(müşterilerimiz|referanslarımız|our clients|our customers)/i.test(emailText)) warnings.push('possible invented social proof')

  const companyFold = foldTurkish(pitch.company.name).split(/\s+/)[0]
  if (companyFold && !foldTurkish(pitch.landing.headline).includes(companyFold)) warnings.push('landing.headline does not mention the company')
  if (!foldTurkish(`${pitch.email.subject} ${pitch.email.subjectAlt}`).includes(companyFold) && !foldTurkish(`${pitch.email.subject} ${pitch.email.subjectAlt}`).includes(foldTurkish(pitch.person.greetingName).split(/\s+/)[0])) {
    warnings.push('subjects mention neither the company nor the person')
  }

  for (const flag of pitch.flags) if (!(knownFlags as readonly string[]).includes(flag)) warnings.push(`unknown flag ${flag}`)

  return { ok: errors.length === 0, errors, warnings, pitch }
}
