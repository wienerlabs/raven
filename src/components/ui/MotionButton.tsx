'use client'

import { motion, type HTMLMotionProps } from 'framer-motion'

type Props = HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost'; full?: boolean; small?: boolean }

export function MotionButton({ variant = 'primary', full = false, small = false, className = '', disabled, children, type = 'button', ...rest }: Props) {
  const base = variant === 'primary' ? 'btn' : 'btn-ghost'
  return (
    <motion.button
      type={type}
      whileHover={disabled ? undefined : { scale: 1.02, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 520, damping: 28 }}
      className={`${base}${small ? ' btn-sm' : ''}${full ? ' w-full' : ''} ${className}`}
      disabled={disabled}
      {...rest}
    >
      {children}
    </motion.button>
  )
}
