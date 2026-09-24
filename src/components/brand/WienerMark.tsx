import Image from 'next/image'

export function WienerMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Image src="/brand/wiener-mark-256.png" alt="" width={size} height={size} className={`shrink-0 dark:invert ${className}`} style={{ width: size, height: size }} draggable={false} />
}

export function WienerCredit({ className = '' }: { className?: string }) {
  return (
    <a href="https://wienerlabs.xyz" target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 text-xs text-mute transition hover:text-ink ${className}`}>
      <WienerMark size={14} />
      Wiener Labs ürünü
    </a>
  )
}
