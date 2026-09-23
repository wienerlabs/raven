'use client'

import { useFormStatus } from 'react-dom'
import { MotionButton } from './MotionButton'

export function SubmitButton({ children, pendingLabel, variant = 'primary', small = false, className = '', name, value, disabled }: { children: React.ReactNode; pendingLabel?: string; variant?: 'primary' | 'ghost'; small?: boolean; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <MotionButton type="submit" variant={variant} small={small} className={className} disabled={pending || disabled} name={name} value={value}>
      {pending ? (pendingLabel ?? 'Çalışıyor') : children}
    </MotionButton>
  )
}
