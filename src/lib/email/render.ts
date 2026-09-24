import type { Pitch } from '@/lib/pitch/schema'
import type { AppSettings } from '@/lib/settings'
import { logoBox, logoPath, type BrandSettings } from '@/lib/brand/logo'
import { emailCopy } from './copy'
import { buildLinks, type MessageLinks } from './links'

export interface RenderInput {
  pitch: Pitch
  contact: { slug: string; company: string }
  message: { token: string; step: number; variant: 'a' | 'b' }
  settings: AppSettings
  baseUrl: string
  replyTo: string
  firstSubject?: string | null
  whatsappNumber?: string | null
  brand?: BrandSettings | null
}

export interface RenderedEmail {
  subject: string
  preheader: string
  html: string
  text: string
  headers: Record<string, string>
  links: MessageLinks
}

const palette = {
  ink: '#111111',
  body: '#2b2b2b',
  mute: '#6b6b6b',
  faint: '#8a8a8a',
  line: '#e6e6e6',
  soft: '#f6f6f6',
  accent: '#d9dbfc',
  accentStrong: '#c2c6fa',
  accentSoft: '#eef0ff',
}

const fontStack = "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function paragraphs(text: string, style: string): string {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="${style}">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

function pill(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 6px 8px 0;padding:8px 15px;border:1px solid ${palette.line};border-radius:999px;background:#ffffff;color:${palette.ink};font-family:${fontStack};font-size:13px;font-weight:300;line-height:18px;text-decoration:none;">${escapeHtml(label)}</a>`
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;"><tr><td style="border-radius:999px;background:${palette.accent};border:1px solid ${palette.accentStrong};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-family:${fontStack};font-size:14px;font-weight:400;line-height:18px;color:${palette.ink};text-decoration:none;border-radius:999px;">${escapeHtml(label)} &rarr;</a></td></tr></table>`
}

function signatureHtml(settings: AppSettings): string {
  const { sender } = settings
  const details = [websiteLabel(sender.website), sender.phone].filter(Boolean).map(escapeHtml).join(' &middot; ')
  return `<p style="margin:0;font-family:${fontStack};font-size:14px;line-height:22px;font-weight:300;color:${palette.ink};">${escapeHtml(sender.fullName)}</p><p style="margin:0;font-family:${fontStack};font-size:13px;line-height:20px;font-weight:300;color:${palette.mute};">${escapeHtml(sender.title)}, ${escapeHtml(sender.company)}${details ? `<br>${details}` : ''}</p>`
}

function signatureText(settings: AppSettings): string {
  const { sender } = settings
  return [sender.fullName, `${sender.title}, ${sender.company}`, [websiteLabel(sender.website), sender.phone].filter(Boolean).join(' · ')].filter(Boolean).join('\n')
}

function footerHtml(input: RenderInput, links: MessageLinks): string {
  const copy = emailCopy[input.pitch.language]
  const { legal } = input.settings
  const legalLine = [legal.companyName, legal.address].filter(Boolean).map(escapeHtml).join(' &middot; ')
  const privacyUrl = `${input.baseUrl.replace(/\/+$/, '')}/gizlilik`
  return `<p style="margin:0 0 6px;font-family:${fontStack};font-size:12px;line-height:18px;font-weight:300;color:${palette.faint};">${escapeHtml(copy.why(input.pitch.company.name))} ${escapeHtml(copy.source(input.settings.partnerName))}</p><p style="margin:0;font-family:${fontStack};font-size:12px;line-height:18px;font-weight:300;color:${palette.faint};"><a href="${escapeHtml(privacyUrl)}" style="color:${palette.mute};text-decoration:underline;">${escapeHtml(copy.privacy)}</a> &middot; <a href="${escapeHtml(links.unsubscribePage)}" style="color:${palette.mute};text-decoration:underline;">${escapeHtml(copy.unsubscribe)}</a>${legalLine ? ` &middot; ${legalLine}` : ''}</p>`
}

function frame(input: RenderInput, preheader: string, inner: string, links: MessageLinks, trackOpens: boolean): string {
  const copy = emailCopy[input.pitch.language]
  const base = input.baseUrl.replace(/\/+$/, '')
  const pixel = trackOpens ? `<img src="${escapeHtml(links.openPixel)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">` : ''
  return `<!doctype html>
<html lang="${input.pitch.language}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.pitch.email.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:${palette.soft};}
a{color:${palette.ink};}
@media (max-width:620px){.raven-card{padding:26px 22px 22px !important;border-radius:20px !important;}.raven-title{font-size:20px !important;line-height:26px !important;}}
</style>
</head>
<body style="margin:0;padding:0;background:${palette.soft};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}${'&#8199;&#847;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${palette.soft};">
<tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">
<tr><td style="padding:0 6px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;">${brandHeader(input, base)}</td>
<td align="right" style="vertical-align:middle;"><span style="display:inline-block;padding:4px 12px;border:1px solid ${palette.accent};border-radius:999px;background:${palette.accentSoft};font-family:${fontStack};font-size:12px;font-weight:300;color:${palette.ink};">${escapeHtml(copy.badge)}</span></td>
</tr></table>
</td></tr>
<tr><td class="raven-card" style="background:#ffffff;border:1px solid ${palette.line};border-radius:24px;padding:34px 36px 28px;">
<div style="width:56px;height:4px;line-height:4px;font-size:0;margin:0 0 26px;border-radius:4px;background-color:${palette.accentStrong};background-image:linear-gradient(90deg,#f7c6dc,${palette.accentStrong},#bfe7f7);">&nbsp;</div>
${inner}
</td></tr>
<tr><td style="padding:18px 8px 0;">${footerHtml(input, links)}</td></tr>
</table>
${pixel}
</td></tr>
</table>
</body>
</html>`
}

function brandHeader(input: RenderInput, base: string): string {
  const company = escapeHtml(input.settings.sender.company)
  const name = `<span style="display:inline-block;vertical-align:middle;margin-left:8px;font-family:${fontStack};font-size:15px;font-weight:300;letter-spacing:-0.01em;color:${palette.ink};">${company}</span>`
  const logo = input.brand?.logo
  if (!logo) return `<img src="${escapeHtml(base)}/brand/wiener-mark-email.png" width="26" height="26" alt="${company}" style="display:inline-block;vertical-align:middle;border:0;width:26px;height:26px;">${name}`
  const box = logoBox(logo)
  const image = `<img src="${escapeHtml(base)}${logoPath(logo)}" width="${box.width}" height="${box.height}" alt="${company}" style="display:inline-block;vertical-align:middle;border:0;outline:none;text-decoration:none;width:${box.width}px;height:${box.height}px;max-width:${box.width}px;">`
  return input.brand?.showCompanyName ? `${image}${name}` : image
}

const bodyStyle = `margin:0 0 16px;font-family:${fontStack};font-size:15px;line-height:25px;font-weight:300;color:${palette.body};`

function whatsappLine(input: RenderInput, links: MessageLinks): string {
  if (!input.whatsappNumber) return ''
  const copy = emailCopy[input.pitch.language]
  return `<p style="margin:-14px 0 26px;font-family:${fontStack};font-size:12px;line-height:18px;font-weight:300;color:${palette.mute};">${escapeHtml(copy.whatsappChatHint)} <a href="${escapeHtml(links.whatsappChat)}" style="color:${palette.ink};text-decoration:underline;">${escapeHtml(copy.whatsappChat)}</a></p>`
}

function quickReplyHtml(input: RenderInput, links: MessageLinks): string {
  const copy = emailCopy[input.pitch.language]
  return `<p style="margin:0 0 8px;font-family:${fontStack};font-size:12px;line-height:18px;font-weight:300;color:${palette.mute};">${escapeHtml(copy.quickReply)}</p><div style="margin:0 0 26px;">${pill(links.intents.meeting, copy.meeting)}${pill(links.intents.info, copy.info)}${pill(links.intents.later, copy.later)}</div>${whatsappLine(input, links)}`
}

function whatsappText(input: RenderInput, links: MessageLinks): string[] {
  if (!input.whatsappNumber) return []
  const copy = emailCopy[input.pitch.language]
  return [`${copy.whatsappChat}: ${links.whatsappChat}`]
}

function solutionBlock(pitch: Pitch): string {
  const copy = emailCopy[pitch.language]
  const bullets = pitch.solution.capabilities
    .map(
      (item) =>
        `<tr><td width="18" style="vertical-align:top;padding:9px 0 0;"><div style="width:6px;height:6px;border-radius:6px;background:${palette.ink};font-size:0;line-height:0;">&nbsp;</div></td><td style="vertical-align:top;padding:2px 0 4px;font-family:${fontStack};font-size:14px;line-height:22px;font-weight:300;color:${palette.body};">${escapeHtml(item)}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;"><tr><td style="background:${palette.accentSoft};border:1px solid ${palette.accent};border-radius:20px;padding:22px 24px 18px;">
<p style="margin:0 0 4px;font-family:${fontStack};font-size:12px;line-height:18px;font-weight:300;color:${palette.mute};">${escapeHtml(copy.systemLabel)}</p>
<p class="raven-title" style="margin:0 0 6px;font-family:${fontStack};font-size:22px;line-height:28px;font-weight:300;letter-spacing:-0.02em;color:${palette.ink};">${escapeHtml(pitch.solution.name)}</p>
<p style="margin:0 0 12px;font-family:${fontStack};font-size:14px;line-height:22px;font-weight:300;color:${palette.mute};">${escapeHtml(pitch.solution.tagline)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${bullets}</table>
</td></tr></table>`
}

export function subjectFor(pitch: Pitch, variant: 'a' | 'b'): string {
  return variant === 'b' ? pitch.email.subjectAlt : pitch.email.subject
}

export function renderEmail(input: RenderInput, trackOpens = input.settings.tracking.opens): RenderedEmail {
  const { message } = input
  const links = buildLinks(input.baseUrl, input.contact.slug, message.token)
  const headers: Record<string, string> = {
    'List-Unsubscribe': `<${links.unsubscribeOneClick}>, <mailto:${input.replyTo}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
  if (message.step === 0) return renderInitial(input, links, headers, trackOpens)
  return renderFollowUp(input, links, headers, trackOpens)
}

function renderInitial(input: RenderInput, links: MessageLinks, headers: Record<string, string>, trackOpens: boolean): RenderedEmail {
  const { pitch, settings } = input
  const copy = emailCopy[pitch.language]
  const subject = subjectFor(pitch, input.message.variant)
  const inner = [
    `<p style="${bodyStyle}">${escapeHtml(pitch.person.salutation)}</p>`,
    paragraphs(pitch.email.opening, bodyStyle),
    paragraphs(pitch.email.body, bodyStyle),
    solutionBlock(pitch),
    paragraphs(pitch.email.cta, bodyStyle),
    primaryButton(links.landing, copy.openBrief),
    quickReplyHtml(input, links),
    `<div style="border-top:1px solid ${palette.line};padding-top:20px;">${signatureHtml(settings)}</div>`,
    `<p style="margin:18px 0 0;font-family:${fontStack};font-size:14px;line-height:22px;font-weight:300;color:${palette.body};"><span style="color:${palette.mute};">${escapeHtml(copy.psLabel)}</span> ${escapeHtml(pitch.email.ps)}</p>`,
  ].join('\n')
  const text = [
    pitch.person.salutation,
    '',
    pitch.email.opening,
    '',
    pitch.email.body,
    '',
    `${pitch.solution.name}: ${pitch.solution.tagline}`,
    ...pitch.solution.capabilities.map((item) => `- ${item}`),
    '',
    pitch.email.cta,
    '',
    `${copy.briefLine}: ${links.landing}`,
    '',
    `${copy.quickReply}:`,
    `${copy.meeting}: ${links.intents.meeting}`,
    `${copy.info}: ${links.intents.info}`,
    `${copy.later}: ${links.intents.later}`,
    ...whatsappText(input, links),
    '',
    signatureText(settings),
    '',
    `${copy.psLabel} ${pitch.email.ps}`,
    '',
    '--',
    `${copy.why(pitch.company.name)} ${copy.source(settings.partnerName)}`,
    `${copy.unsubscribe}: ${links.unsubscribePage}`,
  ].join('\n')
  return { subject, preheader: pitch.email.preheader, html: frame(input, pitch.email.preheader, inner, links, trackOpens), text, headers, links }
}

function renderFollowUp(input: RenderInput, links: MessageLinks, headers: Record<string, string>, trackOpens: boolean): RenderedEmail {
  const { pitch, settings, message } = input
  const copy = emailCopy[pitch.language]
  const followUp = pitch.followUps[Math.min(message.step, pitch.followUps.length) - 1]
  const original = input.firstSubject ?? subjectFor(pitch, message.variant)
  const subject = /^re:/i.test(original) ? original : `Re: ${original}`
  const inner = [
    `<p style="${bodyStyle}">${escapeHtml(pitch.person.salutation)}</p>`,
    paragraphs(followUp.body, bodyStyle),
    `<p style="${bodyStyle}"><a href="${escapeHtml(links.landing)}" style="color:${palette.ink};text-decoration:underline;text-decoration-color:${palette.accentStrong};">${escapeHtml(copy.briefLine)}: ${escapeHtml(pitch.solution.name)}</a></p>`,
    quickReplyHtml(input, links),
    `<div style="border-top:1px solid ${palette.line};padding-top:20px;">${signatureHtml(settings)}</div>`,
  ].join('\n')
  const text = [
    pitch.person.salutation,
    '',
    followUp.body,
    '',
    `${copy.briefLine}: ${links.landing}`,
    '',
    `${copy.meeting}: ${links.intents.meeting}`,
    `${copy.info}: ${links.intents.info}`,
    `${copy.later}: ${links.intents.later}`,
    ...whatsappText(input, links),
    '',
    signatureText(settings),
    '',
    '--',
    `${copy.unsubscribe}: ${links.unsubscribePage}`,
  ].join('\n')
  return { subject, preheader: followUp.body.slice(0, 110), html: frame(input, followUp.body.slice(0, 110), inner, links, trackOpens), text, headers, links }
}

export function renderWhatsapp(pitch: Pitch, link: string): string {
  const copy = emailCopy[pitch.language]
  return `${pitch.whatsapp.replace('{link}', link)}\n\n${copy.whatsappOptOut}`
}
