import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { sessionSecret } from '@/lib/env'
import { createSessionValue, verifySessionValue } from './tokens'

export const SESSION_COOKIE = 'raven_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14

export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  return verifySessionValue(store.get(SESSION_COOKIE)?.value, sessionSecret())
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/giris')
}

export async function startSession(): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, createSessionValue(sessionSecret(), SESSION_TTL_SECONDS), {
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
