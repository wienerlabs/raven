'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/actions/auth'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function LoginForm({ secondary = false }: { secondary?: boolean }) {
  const [state, action] = useActionState<LoginState, FormData>(login, { error: null })
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">
          {secondary ? 'Yönetici şifresi' : 'Şifre'}
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" autoFocus={!secondary} />
      </div>
      {state.error ? (
        <p className="text-sm text-ink" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton className="w-full" variant={secondary ? 'ghost' : 'primary'} pendingLabel="Kontrol ediliyor">
        {secondary ? 'Şifreyle giriş yap' : 'Giriş yap'}
      </SubmitButton>
    </form>
  )
}
