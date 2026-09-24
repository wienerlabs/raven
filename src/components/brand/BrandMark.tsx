import Image from 'next/image'
import { logoBox, logoPath, type BrandSettings } from '@/lib/brand/logo'

export function BrandMark({ brand, company, size = 26 }: { brand: BrandSettings; company: string; size?: number }) {
  const logo = brand.logo
  if (!logo) {
    return (
      <div className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
        <Image src="/brand/wiener-mark-256.png" alt="" width={size} height={size} style={{ width: size, height: size }} priority />
        {company}
      </div>
    )
  }
  const box = logoBox(logo, size, 200)
  return (
    <div className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
      <img src={logoPath(logo)} width={box.width} height={box.height} alt={brand.showCompanyName ? '' : company} style={{ width: box.width, height: box.height }} />
      {brand.showCompanyName ? company : null}
    </div>
  )
}
