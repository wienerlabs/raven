import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type { Database } from '@/lib/db'
import { members, passkeys } from '@/lib/db/schema'
import {
  CHALLENGE_TTL_MS,
  INVITE_TTL_MS,
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
} from '@/lib/auth/passkeys'
import { createSessionValue, readSessionValue } from '@/lib/security/tokens'
import { openTestDb, type TestDatabase } from './db'
import { softAuthenticator } from './authenticator'

const rp = relyingParty('https://raven.example.com')
type Authenticator = ReturnType<typeof softAuthenticator>

function asRegistration(value: unknown): RegistrationResponseJSON {
  return parseCredential<RegistrationResponseJSON>(value) as RegistrationResponseJSON
}

function asAssertion(value: unknown): AuthenticationResponseJSON {
  return parseCredential<AuthenticationResponseJSON>(value) as AuthenticationResponseJSON
}

describe('passkey login', () => {
  let db: Database
  let handle: TestDatabase

  beforeEach(async () => {
    handle = await openTestDb()
    db = handle.db
  })

  afterEach(async () => {
    await handle.close()
  })

  async function enroll(name = 'Baturalp Güvenç', authenticator: Authenticator = softAuthenticator(rp.origin, rp.id)) {
    const begin = await beginRegistration(db, rp, { memberId: null, name })
    const result = await completeRegistration(db, rp, begin.challengeId, asRegistration(authenticator.register(begin.options)), { label: 'Mac · Safari', via: 'admin' })
    return { result, authenticator }
  }

  async function signIn(authenticator: Authenticator, overrides: { origin?: string } = {}) {
    const login = await beginLogin(db, rp)
    return completeLogin(db, rp, login.challengeId, asAssertion(authenticator.authenticate(login.options, overrides)))
  }

  it('registers a device and signs in with it', async () => {
    const { result, authenticator } = await enroll()
    expect(result).toMatchObject({ ok: true, name: 'Baturalp Güvenç' })
    expect(await signIn(authenticator)).toMatchObject({ ok: true, name: 'Baturalp Güvenç' })
    const [key] = await db.select().from(passkeys)
    expect(key.counter).toBe(1)
    expect(key.label).toBe('Mac · Safari')
    const [member] = await db.select().from(members)
    expect(member.lastLoginAt).not.toBeNull()
  })

  it('accepts a challenge only once', async () => {
    const { authenticator } = await enroll()
    const login = await beginLogin(db, rp)
    expect((await completeLogin(db, rp, login.challengeId, asAssertion(authenticator.authenticate(login.options)))).ok).toBe(true)
    expect(await completeLogin(db, rp, login.challengeId, asAssertion(authenticator.authenticate(login.options)))).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects an expired challenge', async () => {
    const { authenticator } = await enroll()
    const login = await beginLogin(db, rp)
    const late = new Date(Date.now() + CHALLENGE_TTL_MS + 1000)
    expect(await completeLogin(db, rp, login.challengeId, asAssertion(authenticator.authenticate(login.options)), late)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects an assertion made for another site', async () => {
    const { authenticator } = await enroll()
    expect(await signIn(authenticator, { origin: 'https://raven.example.com.evil.test' })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('requires Face ID, Touch ID or a device PIN', async () => {
    const { result } = await enroll('Deniz', softAuthenticator(rp.origin, rp.id, { userVerified: false }))
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.select().from(members)).toHaveLength(0)
  })

  it('does not know devices that were never added or were removed', async () => {
    const stranger = softAuthenticator(rp.origin, rp.id)
    expect(await signIn(stranger)).toEqual({ ok: false, reason: 'unknown' })
    const { authenticator } = await enroll()
    await db.delete(passkeys).where(eq(passkeys.id, authenticator.id))
    expect(await signIn(authenticator)).toEqual({ ok: false, reason: 'unknown' })
  })

  it('adds a second device to the same person', async () => {
    const { result } = await enroll()
    if (!result.ok) throw new Error('enroll failed')
    const phone = softAuthenticator(rp.origin, rp.id)
    const begin = await beginRegistration(db, rp, { memberId: result.memberId, name: result.name })
    expect(begin.options.excludeCredentials).toHaveLength(1)
    const second = await completeRegistration(db, rp, begin.challengeId, asRegistration(phone.register(begin.options)), { label: 'iPhone · Safari', via: 'admin' })
    expect(second).toMatchObject({ ok: true, memberId: result.memberId })
    expect(await db.select().from(passkeys).where(eq(passkeys.memberId, result.memberId))).toHaveLength(2)
    expect(await signIn(phone)).toMatchObject({ ok: true, memberId: result.memberId })
  })

  it('lets an invite be used exactly once', async () => {
    const { token } = await createInvite(db, 'Ayşe Kaya', null)
    const invite = await findInvite(db, token)
    expect(invite?.name).toBe('Ayşe Kaya')
    const first = softAuthenticator(rp.origin, rp.id)
    const second = softAuthenticator(rp.origin, rp.id)
    const target = { memberId: null, name: 'Ayşe Kaya', inviteId: invite?.id }
    const beginFirst = await beginRegistration(db, rp, target)
    const beginSecond = await beginRegistration(db, rp, target)
    expect(await completeRegistration(db, rp, beginFirst.challengeId, asRegistration(first.register(beginFirst.options)), { label: 'iPhone', via: 'invite' })).toMatchObject({ ok: true, name: 'Ayşe Kaya' })
    expect(await completeRegistration(db, rp, beginSecond.challengeId, asRegistration(second.register(beginSecond.options)), { label: 'iPhone', via: 'invite' })).toEqual({ ok: false, reason: 'invite' })
    expect(await findInvite(db, token)).toBeNull()
    expect(await db.select().from(passkeys)).toHaveLength(1)
  })

  it('refuses expired invites and keeps the two flows apart', async () => {
    const { token } = await createInvite(db, 'Can', null, new Date(Date.now() - INVITE_TTL_MS - 1000))
    expect(await findInvite(db, token)).toBeNull()
    const authenticator = softAuthenticator(rp.origin, rp.id)
    const begin = await beginRegistration(db, rp, { memberId: null, name: 'Can' })
    expect(await completeRegistration(db, rp, begin.challengeId, asRegistration(authenticator.register(begin.options)), { label: 'Mac', via: 'invite' })).toEqual({ ok: false, reason: 'invalid' })
    expect(await findInvite(db, 'short')).toBeNull()
  })
})

describe('passkey helpers', () => {
  it('cleans names and labels devices', () => {
    expect(cleanMemberName('  Baturalp   Güvenç ')).toBe('Baturalp Güvenç')
    expect(cleanMemberName('a')).toBeNull()
    expect(cleanMemberName(`Ali${String.fromCharCode(7)}`)).toBeNull()
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe('Mac · Chrome')
    expect(deviceLabel(null)).toBe('Cihaz')
  })

  it('rejects malformed credentials before they reach the verifier', () => {
    expect(parseCredential({ id: 'x', type: 'public-key' })).toBeNull()
    expect(parseCredential('nope')).toBeNull()
  })

  it('carries who signed in inside the session', () => {
    const secret = 's'.repeat(40)
    const value = createSessionValue(secret, 60, 1_000_000, { sub: '5a0f1f6e-1111-4c1d-9c55-0f5f0c0d0e0f', name: 'Baturalp' })
    expect(readSessionValue(value, secret, 1_000_000)).toMatchObject({ sub: '5a0f1f6e-1111-4c1d-9c55-0f5f0c0d0e0f', name: 'Baturalp' })
    expect(readSessionValue(createSessionValue(secret, 60, 1_000_000), secret, 1_000_000)).toMatchObject({ sub: 'password' })
  })
})
