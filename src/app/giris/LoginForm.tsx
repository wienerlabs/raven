'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/actions/auth'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(login, { error: null })
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          Şifre
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" autoFocus />
      </div>
      {state.error ? <p className="text-sm text-ink">{state.error}</p> : null}
      <SubmitButton className="w-full" pendingLabel="Kontrol ediliyor">
        Giriş yap
      </SubmitButton>
    </form>
  )
}
