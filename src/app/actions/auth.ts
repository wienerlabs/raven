'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { adminPassword } from '@/lib/env'
import { clearLoginFailures, loginBlocked, registerLoginFailure } from '@/lib/security/login-limit'
import { endSession, startSession } from '@/lib/security/session'
import { safeEqual } from '@/lib/security/tokens'

export interface LoginState {
  error: string | null
}

async function clientIp(): Promise<string> {
  const list = await headers()
  return list.get('x-real-ip')?.trim() || list.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const ip = await clientIp()
  const db = await getDb()
  if (await loginBlocked(db, ip)) return { error: 'Çok fazla hatalı deneme yapıldı. 15 dakika sonra tekrar deneyin.' }
  const password = String(formData.get('password') ?? '')
  await new Promise((resolve) => setTimeout(resolve, 400))
  if (!password || !safeEqual(password, adminPassword())) {
    await registerLoginFailure(db, ip)
    return { error: 'Şifre hatalı.' }
  }
  await clearLoginFailures(db, ip)
  await startSession()
  redirect('/')
}

export async function logout(): Promise<void> {
  await endSession()
  redirect('/giris')
}
