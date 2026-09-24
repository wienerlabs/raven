'use client'

import { useState } from 'react'
import { ScanFace } from 'lucide-react'
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser'
import { passkeyLoginOptions, passkeyLoginVerify } from '@/app/actions/passkeys'
import { MotionButton } from '@/components/ui/MotionButton'
import { webauthnMessage } from './webauthn-messages'

export function PasskeyLoginButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signIn = async () => {
    setError(null)
    if (!browserSupportsWebAuthn()) {
      setError('Bu tarayıcı Face ID ile girişi desteklemiyor. Şifreyle devam edin.')
      return
    }
    setPending(true)
    try {
      const begin = await passkeyLoginOptions()
      if (!begin.ok) {
        setError(begin.message)
        return
      }
      const credential = await startAuthentication({ optionsJSON: begin.options })
      const result = await passkeyLoginVerify(credential)
      if (!result.ok) {
        setError(result.message)
        return
      }
      window.location.assign('/')
    } catch (failure) {
      setError(webauthnMessage(failure))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <MotionButton full onClick={signIn} disabled={pending} className="py-3">
        <ScanFace className="h-4 w-4" />
        {pending ? 'Face ID bekleniyor' : 'Face ID ile giriş yap'}
      </MotionButton>
      {error ? (
        <p className="text-sm text-ink" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
