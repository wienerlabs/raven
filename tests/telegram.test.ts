import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  botApi,
  contactPayload,
  getBotIdentity,
  groupStartLink,
  isBotToken,
  isTelegramStop,
  parseStart,
  parseTelegramUpdate,
  previewPayload,
  sendTelegramText,
  setBotWebhook,
  startLink,
  teamPayload,
  telegramHandle,
  verifyTelegramSecret,
} from '@/lib/channels/telegram'
import { renderEmail } from '@/lib/email/render'
import { buildReplyPrompt, cleanDraft, type ReplyContext } from '@/lib/ai/reply'
import { botProfiles, telegramCopy } from '@/lib/telegram/copy'
import { defaultSettings } from '@/lib/settings'
import { pitchFor } from './fixtures'

const token = `123456789:${'raven_test_token_'.repeat(2)}xyz`
const dashes = new RegExp(`[${String.fromCharCode(0x2012, 0x2013, 0x2014, 0x2015)}!]`)

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('telegram updates', () => {
  it('normalises private messages, captions and membership changes', () => {
    const message = parseTelegramUpdate({
      update_id: 7,
      message: { message_id: 42, date: 1790000000, text: 'Merhaba', chat: { id: 555, type: 'private', first_name: 'Deniz' }, from: { id: 555, first_name: 'Deniz', last_name: 'Aksoy', username: 'deniz', language_code: 'tr' } },
    })
    expect(message).toEqual({
      kind: 'message',
      updateId: 7,
      chatId: '555',
      chatType: 'private',
      chatTitle: 'Deniz',
      messageId: 42,
      from: { id: '555', username: 'deniz', firstName: 'Deniz', lastName: 'Aksoy', languageCode: 'tr' },
      text: 'Merhaba',
      at: 1790000000,
    })
    expect(parseTelegramUpdate({ update_id: 8, message: { message_id: 1, chat: { id: 1, type: 'private' }, caption: 'Fotoğraf notu' } })).toMatchObject({ text: 'Fotoğraf notu', from: null })
    expect(parseTelegramUpdate({ update_id: 9, message: { message_id: 2, chat: { id: 1, type: 'private' }, from: { id: 9, is_bot: true } } })).toBeNull()
    expect(parseTelegramUpdate({ update_id: 10, my_chat_member: { chat: { id: -100, type: 'supergroup', title: 'Ekip' }, date: 5, new_chat_member: { status: 'left' } } })).toEqual({
      kind: 'membership',
      updateId: 10,
      chatId: '-100',
      chatType: 'supergroup',
      chatTitle: 'Ekip',
      status: 'left',
      at: 5,
    })
    for (const body of [null, 'x', {}, { message: { message_id: '1', chat: { id: 1 } } }, { message: { message_id: 1, chat: { id: '1' } } }]) expect(parseTelegramUpdate(body)).toBeNull()
  })

  it('reads start payloads for contacts, previews and team links', () => {
    expect(parseStart('/start r-AbCdE12345')).toEqual({ kind: 'contact', slug: 'AbCdE12345' })
    expect(parseStart('/start@WienerLabsBot t-AbCdE12345')).toEqual({ kind: 'preview', slug: 'AbCdE12345' })
    expect(parseStart('/start ekip-abcdefghijklmnopqrstuvwx')).toEqual({ kind: 'team', code: 'abcdefghijklmnopqrstuvwx' })
    expect(parseStart('/start')).toEqual({ kind: 'plain' })
    expect(parseStart('/start başka')).toEqual({ kind: 'unknown' })
    expect(parseStart('/start r-Ab/../x')).toEqual({ kind: 'unknown' })
    expect(parseStart('Merhaba /start r-AbCdE12345')).toBeNull()
    expect(parseStart(null)).toBeNull()
    expect(parseStart(`/start ${contactPayload('AbCdE12345')}`)).toEqual({ kind: 'contact', slug: 'AbCdE12345' })
    expect(parseStart(`/start ${previewPayload('AbCdE12345')}`)).toEqual({ kind: 'preview', slug: 'AbCdE12345' })
    expect(parseStart(`/start ${teamPayload('abcdefghijklmnop_-12')}`)).toEqual({ kind: 'team', code: 'abcdefghijklmnop_-12' })
  })

  it('builds deep links within the 64 character payload limit', () => {
    expect(startLink('WienerLabsBot', contactPayload('AbCdE12345'))).toBe('https://t.me/WienerLabsBot?start=r-AbCdE12345')
    expect(groupStartLink('WienerLabsBot', teamPayload('x'.repeat(24)))).toBe(`https://t.me/WienerLabsBot?startgroup=ekip-${'x'.repeat(24)}`)
    expect(teamPayload('x'.repeat(48)).length).toBeLessThanOrEqual(64)
  })

  it('treats only a clear stop message as an opt out', () => {
    for (const text of ['DUR', 'dur', ' Dur. ', '/dur', '/stop@WienerLabsBot', 'STOP', 'İPTAL', 'UNSUBSCRIBE', 'Çık', 'istemiyorum']) expect(isTelegramStop(text)).toBe(true)
    for (const text of ['Dur, bir sorum var', 'Durum nedir?', 'Stop by next week', 'iptal etmeyin lütfen', '', null]) expect(isTelegramStop(text)).toBe(false)
  })

  it('checks the webhook secret header', () => {
    expect(verifyTelegramSecret('s3cret-value', 's3cret-value')).toBe(true)
    expect(verifyTelegramSecret('wrong', 's3cret-value')).toBe(false)
    expect(verifyTelegramSecret(null, 's3cret-value')).toBe(false)
    expect(verifyTelegramSecret('anything', '')).toBe(false)
  })

  it('names a chat by username first', () => {
    expect(telegramHandle({ username: 'deniz', firstName: 'Deniz', lastName: null })).toBe('@deniz')
    expect(telegramHandle({ username: null, firstName: 'Deniz', lastName: 'Aksoy' })).toBe('Deniz Aksoy')
    expect(telegramHandle({ username: null, firstName: null, lastName: null })).toBe('Telegram')
  })
})

describe('telegram bot api', () => {
  it('refuses malformed tokens before calling Telegram', async () => {
    const fetchMock = reply(200, { ok: true, result: true })
    vi.stubGlobal('fetch', fetchMock)
    expect(isBotToken(token)).toBe(true)
    for (const bad of ['', '123:abc', `${token}/../getMe`, `${token}?x=1`]) expect(isBotToken(bad)).toBe(false)
    const result = await botApi('123:abc/../../x', 'getMe')
    expect(result).toMatchObject({ ok: false, status: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never leaks the token in error messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error(`request to https://api.telegram.org/bot${token}/getMe failed`))))
    const result = await botApi(token, 'getMe')
    expect(result.ok).toBe(false)
    expect(result.error).not.toContain(token)
    expect(result.error).toContain('***')
  })

  it('reads the bot identity and flags an unknown token', async () => {
    const fetchMock = reply(200, { ok: true, result: { id: 777, is_bot: true, first_name: 'Wiener Labs', username: 'WienerLabsBot' } })
    vi.stubGlobal('fetch', fetchMock)
    expect(await getBotIdentity(token)).toEqual({ ok: true, bot: { id: '777', username: 'WienerLabsBot', name: 'Wiener Labs' } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${token}/getMe`)
    expect(init.method).toBe('POST')
    vi.stubGlobal('fetch', reply(401, { ok: false, error_code: 401, description: 'Unauthorized' }))
    expect(await getBotIdentity(token)).toMatchObject({ ok: false, unauthorized: true })
  })

  it('registers the webhook with a secret and one delivery at a time', async () => {
    const fetchMock = reply(200, { ok: true, result: true })
    vi.stubGlobal('fetch', fetchMock)
    expect(await setBotWebhook(token, 'https://raven.example.com/api/webhooks/telegram', 'secret_value')).toEqual({ ok: true, error: null })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.telegram.org/bot${token}/setWebhook`)
    expect(JSON.parse(String(init.body))).toEqual({ url: 'https://raven.example.com/api/webhooks/telegram', secret_token: 'secret_value', allowed_updates: ['message', 'my_chat_member'], max_connections: 1 })
  })

  it('maps send failures to blocked and retryable', async () => {
    const ok = reply(200, { ok: true, result: { message_id: 91 } })
    vi.stubGlobal('fetch', ok)
    expect(await sendTelegramText(token, '555', 'Merhaba')).toEqual({ providerId: '91', blocked: false, retryable: false, error: null })
    const body = JSON.parse(String((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body).toEqual({ chat_id: '555', text: 'Merhaba' })
    vi.stubGlobal('fetch', reply(403, { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }))
    expect(await sendTelegramText(token, '555', 'Merhaba')).toMatchObject({ providerId: null, blocked: true, retryable: false })
    vi.stubGlobal('fetch', reply(429, { ok: false, error_code: 429, description: 'Too Many Requests: retry after 3', parameters: { retry_after: 3 } }))
    expect(await sendTelegramText(token, '555', 'Merhaba')).toMatchObject({ blocked: false, retryable: true })
    const quiet = reply(200, { ok: true, result: { message_id: 92 } })
    vi.stubGlobal('fetch', quiet)
    await sendTelegramText(token, '555', 'x'.repeat(5000), { preview: false })
    const quietBody = JSON.parse(String((quiet.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(quietBody.text).toHaveLength(4096)
    expect(quietBody.link_preview_options).toEqual({ is_disabled: true })
  })
})

describe('telegram copy', () => {
  it('stays inside Telegram limits and the house style', () => {
    for (const profile of botProfiles('Wiener Labs')) {
      expect(profile.description.length).toBeLessThanOrEqual(512)
      expect(profile.shortDescription.length).toBeLessThanOrEqual(120)
      for (const command of profile.commands) expect(command.command).toMatch(/^[a-z0-9_]{1,32}$/)
    }
    const texts = (['tr', 'en'] as const).flatMap((language) => {
      const copy = telegramCopy[language]
      return [copy.greeting({ name: 'Deniz', company: 'Kuzey Lojistik', solution: 'Rota Asistanı', team: 'Wiener Labs' }), copy.welcomeBack('Deniz'), copy.unknown('Wiener Labs'), copy.stopped, copy.description('Wiener Labs')]
    })
    for (const text of texts) {
      expect(text).not.toMatch(dashes)
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
    }
    expect(telegramCopy.tr.greeting({ name: 'Deniz', company: 'Kuzey Lojistik', solution: 'Rota Asistanı', team: 'Wiener Labs' })).toContain('DUR')
  })

  it('offers Telegram next to WhatsApp in the email', () => {
    const base = {
      pitch: pitchFor('Mert', 'Rotaport'),
      contact: { slug: 'AbCdE12345', company: 'Rotaport' },
      message: { token: 'tok_1234567890abcdef', step: 0, variant: 'a' as const },
      settings: defaultSettings,
      baseUrl: 'https://raven.example.com',
      replyTo: 'baturalp@example.com',
    }
    const both = renderEmail({ ...base, whatsappNumber: '+905320000000', telegramBot: 'WienerLabsBot' })
    expect(both.html).toContain('/r/AbCdE12345/whatsapp?m=tok_1234567890abcdef&amp;s=email')
    expect(both.html).toContain('/r/AbCdE12345/telegram?m=tok_1234567890abcdef&amp;s=email')
    expect(both.text).toContain("Telegram'dan yazın: https://raven.example.com/r/AbCdE12345/telegram?m=tok_1234567890abcdef&s=email")
    const onlyTelegram = renderEmail({ ...base, telegramBot: 'WienerLabsBot' })
    expect(onlyTelegram.html).toContain('/telegram?m=')
    expect(onlyTelegram.html).not.toContain('/whatsapp?')
    expect(renderEmail(base).html).not.toContain('/telegram?')
    const followUp = renderEmail({ ...base, message: { ...base.message, step: 1 }, firstSubject: 'Konu', telegramBot: 'WienerLabsBot' })
    expect(followUp.text).toContain('/r/AbCdE12345/telegram?m=')
  })

  it('drafts Telegram replies as short chat messages', () => {
    const context: ReplyContext = {
      channel: 'telegram',
      language: 'tr',
      sender: { fullName: 'Baturalp Güvenç', firstName: 'Baturalp', title: 'Kurucu', company: 'Wiener Labs' },
      contact: { greetingName: 'Deniz', fullName: 'Deniz Aksoy', company: 'Kuzey Lojistik', title: null },
      solution: null,
      calendarUrl: null,
      briefUrl: 'https://raven.example.com/r/AbCdE12345',
      conversation: [{ direction: 'in', text: 'Fiyat nedir?', at: new Date() }],
    }
    expect(buildReplyPrompt(context).system).toContain('Channel: Telegram. One to three short sentences')
    expect(cleanDraft('x'.repeat(900), 'telegram').length).toBeLessThanOrEqual(700)
  })
})
