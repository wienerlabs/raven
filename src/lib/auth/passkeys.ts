import { createHash, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import { authChallenges, invites, members, passkeys } from '@/lib/db/schema'
import { randomToken } from '@/lib/security/tokens'

export interface RelyingParty {
  id: string
  name: string
  origin: string
}

export type PasskeyFailure = 'expired' | 'invalid' | 'unknown' | 'invite'
export type PasskeyResult = { ok: true; memberId: string; name: string } | { ok: false; reason: PasskeyFailure }

export const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000

const credentialShape = z.object({
  id: z.string().min(16).max(1400),
  rawId: z.string().min(16).max(1400),
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
  clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
  authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
})

class PasskeyError extends Error {
  constructor(readonly reason: PasskeyFailure) {
    super(reason)
  }
}

export function relyingParty(base: string): RelyingParty {
  const url = new URL(base)
  return { id: url.hostname, name: 'Raven', origin: url.origin }
}

export function parseCredential<T extends RegistrationResponseJSON | AuthenticationResponseJSON>(value: unknown): T | null {
  const parsed = credentialShape.safeParse(value)
  return parsed.success ? (parsed.data as unknown as T) : null
}

export function cleanMemberName(value: string): string | null {
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 60)
  if (name.length < 2) return null
  for (let index = 0; index < name.length; index++) {
    const code = name.charCodeAt(index)
    if (code < 32 || code === 127) return null
  }
  return name
}

export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? ''
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux|CrOS/.test(ua) ? 'Linux' : 'Cihaz'
  const browser = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return browser ? `${device} · ${browser}` : device
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function userHandle(memberId: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(memberId.replace(/-/g, ''), 'hex'))
}

async function storeChallenge(db: Database, values: { purpose: 'register' | 'login'; challenge: string; memberId?: string; inviteId?: string | null; name?: string }, now: Date): Promise<string> {
  await db.delete(authChallenges).where(lt(authChallenges.expiresAt, now))
  const id = randomToken(24)
  await db.insert(authChallenges).values({
    id,
    purpose: values.purpose,
    challenge: values.challenge,
    memberId: values.memberId ?? null,
    inviteId: values.inviteId ?? null,
    name: values.name ?? null,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  })
  return id
}

async function consumeChallenge(db: Database, id: string | null, purpose: 'register' | 'login', now: Date) {
  if (!id) return null
  const rows = await db
    .delete(authChallenges)
    .where(and(eq(authChallenges.id, id), eq(authChallenges.purpose, purpose)))
    .returning()
  const row = rows[0]
  if (!row || row.expiresAt.getTime() <= now.getTime()) return null
  return row
}

export interface RegistrationTarget {
  memberId: string | null
  name: string
  inviteId?: string | null
}

export async function beginRegistration(
  db: Database,
  rp: RelyingParty,
  target: RegistrationTarget,
  now = new Date(),
): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const memberId = target.memberId ?? randomUUID()
  const existing = target.memberId ? await db.select({ id: passkeys.id, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.memberId, target.memberId)) : []
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: target.name,
    userDisplayName: target.name,
    userID: userHandle(memberId),
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: row.id, transports: row.transports })),
    authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
    preferredAuthenticatorType: 'localDevice',
  })
  const challengeId = await storeChallenge(db, { purpose: 'register', challenge: options.challenge, memberId, inviteId: target.inviteId ?? null, name: target.name }, now)
  return { challengeId, options }
}

export async function completeRegistration(
  db: Database,
  rp: RelyingParty,
  challengeId: string | null,
  response: RegistrationResponseJSON,
  context: { label: string; via: 'admin' | 'invite' },
  now = new Date(),
): Promise<PasskeyResult> {
  const row = await consumeChallenge(db, challengeId, 'register', now)
  if (!row?.memberId || !row.name) return { ok: false, reason: 'expired' }
  if ((context.via === 'invite') !== Boolean(row.inviteId)) return { ok: false, reason: 'invalid' }
  const label = context.label
  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
  try {
    verification = await verifyRegistrationResponse({ response, expectedChallenge: row.challenge, expectedOrigin: rp.origin, expectedRPID: rp.id, requireUserVerification: true })
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (!verification.verified) return { ok: false, reason: 'invalid' }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo
  const memberId = row.memberId
  const inviteId = row.inviteId
  try {
    const name = await db.transaction(async (tx) => {
      if (inviteId) {
        const claimed = await tx
          .update(invites)
          .set({ usedAt: now })
          .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), gt(invites.expiresAt, now)))
          .returning({ id: invites.id })
        if (claimed.length === 0) throw new PasskeyError('invite')
      }
      await tx.insert(members).values({ id: memberId, name: row.name as string }).onConflictDoNothing()
      const inserted = await tx
        .insert(passkeys)
        .values({
          id: credential.id,
          memberId,
          publicKey: isoBase64URL.fromBuffer(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          label: label.slice(0, 80),
          lastUsedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: passkeys.id })
      if (inserted.length === 0) throw new PasskeyError('invalid')
      const [member] = await tx.update(members).set({ lastLoginAt: now }).where(eq(members.id, memberId)).returning({ name: members.name })
      return member?.name ?? (row.name as string)
    })
    return { ok: true, memberId, name }
  } catch (error) {
    if (error instanceof PasskeyError) return { ok: false, reason: error.reason }
    throw error
  }
}

export async function beginLogin(db: Database, rp: RelyingParty, now = new Date()): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const options = await generateAuthenticationOptions({ rpID: rp.id, userVerification: 'required', allowCredentials: [] })
  const challengeId = await storeChallenge(db, { purpose: 'login', challenge: options.challenge }, now)
  return { challengeId, options }
}

export async function completeLogin(db: Database, rp: RelyingParty, challengeId: string | null, response: AuthenticationResponseJSON, now = new Date()): Promise<PasskeyResult> {
  const row = await consumeChallenge(db, challengeId, 'login', now)
  if (!row) return { ok: false, reason: 'expired' }
  const [passkey] = await db.select().from(passkeys).where(eq(passkeys.id, response.id)).limit(1)
  if (!passkey) return { ok: false, reason: 'unknown' }
  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: row.challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: { id: passkey.id, publicKey: isoBase64URL.toBuffer(passkey.publicKey), counter: passkey.counter, transports: passkey.transports },
      requireUserVerification: true,
    })
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (!verification.verified) return { ok: false, reason: 'invalid' }
  const [member] = await db.select().from(members).where(eq(members.id, passkey.memberId)).limit(1)
  if (!member) return { ok: false, reason: 'unknown' }
  await db.update(passkeys).set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: now }).where(eq(passkeys.id, passkey.id))
  await db.update(members).set({ lastLoginAt: now }).where(eq(members.id, member.id))
  return { ok: true, memberId: member.id, name: member.name }
}

export async function createInvite(db: Database, name: string, memberId: string | null, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(24)
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)
  await db.insert(invites).values({ tokenHash: hashToken(token), name, memberId, expiresAt })
  return { token, expiresAt }
}

export async function findInvite(db: Database, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null
  const [invite] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashToken(token)), isNull(invites.usedAt), gt(invites.expiresAt, now)))
    .limit(1)
  return invite ?? null
}

export async function accessOverview(db: Database, now = new Date()) {
  const memberRows = await db.select().from(members).orderBy(asc(members.createdAt))
  const keyRows = await db.select().from(passkeys).orderBy(desc(passkeys.createdAt))
  const inviteRows = await db
    .select({ id: invites.id, name: invites.name, expiresAt: invites.expiresAt, createdAt: invites.createdAt })
    .from(invites)
    .where(and(isNull(invites.usedAt), gt(invites.expiresAt, now)))
    .orderBy(desc(invites.createdAt))
  return {
    members: memberRows.map((member) => ({ ...member, passkeys: keyRows.filter((key) => key.memberId === member.id) })),
    invites: inviteRows,
  }
}

export async function hasPasskeys(db: Database): Promise<boolean> {
  const rows = await db.select({ id: passkeys.id }).from(passkeys).limit(1)
  return rows.length > 0
}
