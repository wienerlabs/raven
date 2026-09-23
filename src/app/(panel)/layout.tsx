import { Shell } from '@/components/shell/Shell'
import { themeScript } from '@/components/shell/theme-script'
import { getDb } from '@/lib/db'
import { navCounts } from '@/lib/queries'
import { requireAdmin } from '@/lib/security/session'

export default async function PanelLayout({ children }: LayoutProps<'/'>) {
  await requireAdmin()
  const db = await getDb()
  const counts = await navCounts(db)
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <Shell inboxCount={counts.inbox} whatsappCount={counts.whatsapp} tagline="Kişiye özel AI çözümleri, herkese kendi dilinden">
        {children}
      </Shell>
    </>
  )
}
