import { z } from 'zod'
import type { Database } from '@/lib/db'
import { getState, setState } from '@/lib/settings'

const KEY = 'auth'

const policySchema = z.object({ passwordLogin: z.boolean().default(true) })

export type AuthPolicy = z.infer<typeof policySchema>

export async function getAuthPolicy(db: Database): Promise<AuthPolicy> {
  const parsed = policySchema.safeParse((await getState<unknown>(db, KEY)) ?? {})
  return parsed.success ? parsed.data : { passwordLogin: true }
}

export function passwordLoginAllowed(policy: AuthPolicy, passkeysExist: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  return policy.passwordLogin || !passkeysExist || env.RAVEN_PASSWORD_LOGIN?.trim().toLowerCase() === 'force'
}

export async function setPasswordLogin(db: Database, enabled: boolean): Promise<void> {
  await setState(db, KEY, { passwordLogin: enabled })
}
