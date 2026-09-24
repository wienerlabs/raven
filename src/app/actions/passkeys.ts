'use server'

import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { getDb } from '@/lib/db'
import { invites, members, passkeys } from '@/lib/db/schema'
import { baseUrl } from '@/lib/env'
import {
  beginLogin,
  beginRegistration,
  cleanMemberName,
  completeLogin,
  completeRegistration,
  createInvite,
  deviceLabel,
  findInvite,
  parseCredential,
  relyingParty,
  type PasskeyFailure,
} from '@/lib/auth/passkeys'
import { clientIp, clientUserAgent } from '@/lib/security/client-ip'
import { clearLoginFailures, loginBlocked, registerLoginFailure } from '@/lib/security/login-limit'
import { isMemberSession, requireAdmin, startSession } from '@/lib/security/session'

const CHALLENGE_COOKIE = 'raven_webauthn'
const PASSKEY_SCOPE = { global: false }
const BLOCKED = 'Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.'

type Outcome = { ok: true; message?: string } | { ok: false; message: string }
type WithOptions<T> = { ok: true; options: T } | { ok: false; message: string }

const failureMessages: Record<PasskeyFailure, string> = {
  expired: 'Doğrulama süresi doldu. Tekrar deneyin.',
  invalid: 'Face ID doğrulaması kabul edilmedi.',
  unknown: 'Bu passkey Raven için tanımlı değil. Ayarlar sayfasından cihaz eklenmesi gerekiyor.',
  invite: 'Davet bağlantısı kullanılmış ya da süresi dolmuş.',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function rp() {
  return relyingParty(baseUrl())
}

async function holdChallenge(id: string): Promise<void> {
  const store = await cookies()
  store.set(CHALLENGE_COOKIE, id, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 300 })
}

async function takeChallenge(): Promise<string | null> {
  const store = await cookies()
  const value = store.get(CHALLENGE_COOKIE)?.value ?? null
  store.delete(CHALLENGE_COOKIE)
  return value
}

export async function passkeyLoginOptions(): Promise<WithOptions<PublicKeyCredentialRequestOptionsJSON>> {
  const db = await getDb()
  if (await loginBlocked(db, await clientIp(), new Date(), PASSKEY_SCOPE)) return { ok: false, message: BLOCKED }
  const { challengeId, options } = await beginLogin(db, rp())
  await holdChallenge(challengeId)
  return { ok: true, options }
}

export async function passkeyLoginVerify(credential: unknown): Promise<Outcome> {
  const ip = await clientIp()
  const db = await getDb()
  if (await loginBlocked(db, ip, new Date(), PASSKEY_SCOPE)) return { ok: false, message: BLOCKED }
  const challengeId = await takeChallenge()
  const response = parseCredential<AuthenticationResponseJSON>(credential)
  const result = response ? await completeLogin(db, rp(), challengeId, response) : ({ ok: false, reason: 'invalid' } as const)
  if (!result.ok) {
    await registerLoginFailure(db, ip, new Date(), PASSKEY_SCOPE)
    return { ok: false, message: failureMessages[result.reason] }
  }
  await clearLoginFailures(db, ip)
  await startSession({ sub: result.memberId, name: result.name })
  return { ok: true }
}

export async function passkeyRegisterOptions(input: { memberId?: string; name?: string }): Promise<WithOptions<PublicKeyCredentialCreationOptionsJSON>> {
  const session = await requireAdmin()
  const db = await getDb()
  let target: { memberId: string | null; name: string } | null = null
  if (isMemberSession(session)) target = { memberId: session.sub, name: session.name }
  else if (input.memberId && uuidPattern.test(input.memberId)) {
    const [member] = await db.select().from(members).where(eq(members.id, input.memberId)).limit(1)
    if (member) target = { memberId: member.id, name: member.name }
  } else {
    const name = cleanMemberName(input.name ?? '')
    if (name) target = { memberId: null, name }
  }
  if (!target) return { ok: false, message: 'Face ID eklenecek kişinin adını yazın.' }
  const { challengeId, options } = await beginRegistration(db, rp(), target)
  await holdChallenge(challengeId)
  return { ok: true, options }
}

export async function passkeyRegisterVerify(credential: unknown): Promise<Outcome> {
  await requireAdmin()
  const db = await getDb()
  const challengeId = await takeChallenge()
  const response = parseCredential<RegistrationResponseJSON>(credential)
  if (!response) return { ok: false, message: failureMessages.invalid }
  const result = await completeRegistration(db, rp(), challengeId, response, { label: deviceLabel(await clientUserAgent()), via: 'admin' })
  revalidatePath('/ayarlar')
  if (!result.ok) return { ok: false, message: failureMessages[result.reason] }
  return { ok: true, message: `${result.name} için Face ID eklendi. Bir sonraki girişte kullanabilirsiniz.` }
}

export async function inviteRegisterOptions(token: string): Promise<WithOptions<PublicKeyCredentialCreationOptionsJSON>> {
  const ip = await clientIp()
  const db = await getDb()
  if (await loginBlocked(db, ip, new Date(), PASSKEY_SCOPE)) return { ok: false, message: BLOCKED }
  const invite = await findInvite(db, token)
  if (!invite) {
    await registerLoginFailure(db, ip, new Date(), PASSKEY_SCOPE)
    return { ok: false, message: failureMessages.invite }
  }
  const { challengeId, options } = await beginRegistration(db, rp(), { memberId: invite.memberId, name: invite.name, inviteId: invite.id })
  await holdChallenge(challengeId)
  return { ok: true, options }
}

export async function inviteRegisterVerify(credential: unknown): Promise<Outcome> {
  const ip = await clientIp()
  const db = await getDb()
  if (await loginBlocked(db, ip, new Date(), PASSKEY_SCOPE)) return { ok: false, message: BLOCKED }
  const challengeId = await takeChallenge()
  const response = parseCredential<RegistrationResponseJSON>(credential)
  const result = response ? await completeRegistration(db, rp(), challengeId, response, { label: deviceLabel(await clientUserAgent()), via: 'invite' }) : ({ ok: false, reason: 'invalid' } as const)
  if (!result.ok) {
    await registerLoginFailure(db, ip, new Date(), PASSKEY_SCOPE)
    return { ok: false, message: failureMessages[result.reason] }
  }
  await startSession({ sub: result.memberId, name: result.name })
  return { ok: true }
}

export async function createInviteAction(input: { name?: string; memberId?: string }): Promise<{ ok: true; link: string; expiresAt: string } | { ok: false; message: string }> {
  await requireAdmin()
  const db = await getDb()
  let name = cleanMemberName(input.name ?? '')
  let memberId: string | null = null
  if (input.memberId && uuidPattern.test(input.memberId)) {
    const [member] = await db.select().from(members).where(eq(members.id, input.memberId)).limit(1)
    if (!member) return { ok: false, message: 'Kişi bulunamadı.' }
    memberId = member.id
    name = member.name
  }
  if (!name) return { ok: false, message: 'Davet edilecek kişinin adını yazın.' }
  const { token, expiresAt } = await createInvite(db, name, memberId)
  revalidatePath('/ayarlar')
  return { ok: true, link: `${baseUrl()}/davet/${token}`, expiresAt: expiresAt.toISOString() }
}

export async function revokeInviteAction(id: string): Promise<Outcome> {
  await requireAdmin()
  if (!uuidPattern.test(id)) return { ok: false, message: 'Davet bulunamadı.' }
  const db = await getDb()
  await db.delete(invites).where(eq(invites.id, id))
  revalidatePath('/ayarlar')
  return { ok: true, message: 'Davet iptal edildi.' }
}

export async function removePasskeyAction(id: string): Promise<Outcome> {
  await requireAdmin()
  const db = await getDb()
  const removed = await db.delete(passkeys).where(eq(passkeys.id, id)).returning({ id: passkeys.id })
  revalidatePath('/ayarlar')
  return removed.length ? { ok: true, message: 'Cihaz kaldırıldı.' } : { ok: false, message: 'Cihaz bulunamadı.' }
}

export async function removeMemberAction(id: string, confirmation: string): Promise<Outcome> {
  const session = await requireAdmin()
  if (!uuidPattern.test(id)) return { ok: false, message: 'Kişi bulunamadı.' }
  if (confirmation.trim().toLocaleLowerCase('tr') !== 'kaldır') return { ok: false, message: 'Onay için "kaldır" yazın.' }
  if (session.sub === id) return { ok: false, message: 'Kendi erişiminizi buradan kaldıramazsınız.' }
  const db = await getDb()
  const removed = await db.delete(members).where(eq(members.id, id)).returning({ id: members.id })
  revalidatePath('/ayarlar')
  return removed.length ? { ok: true, message: 'Kişinin erişimi kaldırıldı. Açık oturumları da kapandı.' } : { ok: false, message: 'Kişi bulunamadı.' }
}
