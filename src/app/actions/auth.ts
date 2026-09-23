'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { adminPassword } from '@/lib/env'
import { endSession, startSession } from '@/lib/security/session'
import { safeEqual } from '@/lib/security/tokens'

const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10

export interface LoginState {
  error: string | null
}

async function clientKey(): Promise<string> {
  const list = await headers()
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'local'
}

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const key = await clientKey()
  const now = Date.now()
  const entry = attempts.get(key)
  if (entry && entry.resetAt > now && entry.count >= MAX_ATTEMPTS) return { error: 'Çok fazla deneme yapıldı. 15 dakika sonra tekrar deneyin.' }
  const password = String(formData.get('password') ?? '')
  await new Promise((resolve) => setTimeout(resolve, 350))
  if (!password || !safeEqual(password, adminPassword())) {
    const next = entry && entry.resetAt > now ? { count: entry.count + 1, resetAt: entry.resetAt } : { count: 1, resetAt: now + WINDOW_MS }
    attempts.set(key, next)
    return { error: 'Şifre hatalı.' }
  }
  attempts.delete(key)
  await startSession()
  redirect('/')
}

export async function logout(): Promise<void> {
  await endSession()
  redirect('/giris')
}
