'use client'

import { useState } from 'react'
import { ScanFace } from 'lucide-react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { inviteRegisterOptions, inviteRegisterVerify } from '@/app/actions/passkeys'
import { MotionButton } from '@/components/ui/MotionButton'
import { webauthnMessage } from '@/components/auth/webauthn-messages'

export function InviteRegister({ token }: { token: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const enable = async () => {
    setError(null)
    if (!browserSupportsWebAuthn()) {
      setError('Bu tarayıcı Face ID kurulumunu desteklemiyor. iPhone veya Mac üzerinde Safari ya da Chrome ile açın.')
      return
    }
    setPending(true)
    try {
      const begin = await inviteRegisterOptions(token)
      if (!begin.ok) {
        setError(begin.message)
        return
      }
      const credential = await startRegistration({ optionsJSON: begin.options })
      const result = await inviteRegisterVerify(credential)
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
      <MotionButton full onClick={enable} disabled={pending} className="py-3">
        <ScanFace className="h-4 w-4" />
        {pending ? 'Face ID bekleniyor' : "Face ID'yi etkinleştir"}
      </MotionButton>
      {error ? (
        <p className="text-sm text-ink" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
