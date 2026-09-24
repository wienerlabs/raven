import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { members } from '@/lib/db/schema'
import { sessionSecret } from '@/lib/env'
import { SESSION_COOKIE } from './cookie-name'
import { createSessionValue, readSessionValue, type SessionPayload, type SessionSubject } from './tokens'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14
const memberIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isMemberSession(session: SessionPayload | null): boolean {
  return Boolean(session && memberIdPattern.test(session.sub))
}

export const readSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies()
  const payload = readSessionValue(store.get(SESSION_COOKIE)?.value, sessionSecret())
  if (!payload) return null
  if (payload.sub === 'password') return payload
  if (!memberIdPattern.test(payload.sub)) return null
  const db = await getDb()
  const [member] = await db.select({ id: members.id, name: members.name }).from(members).where(eq(members.id, payload.sub)).limit(1)
  return member ? { ...payload, name: member.name } : null
})

export async function isAdmin(): Promise<boolean> {
  return (await readSession()) !== null
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await readSession()
  if (!session) redirect('/giris')
  return session
}

export async function startSession(subject?: SessionSubject): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionValue(sessionSecret(), SESSION_TTL_SECONDS, Date.now(), subject), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function endSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
