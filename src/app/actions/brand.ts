'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db'
import { requireAdmin } from '@/lib/security/session'
import { checkLogo, removeLogo, saveLogo, setShowCompanyName } from '@/lib/brand/logo'
import type { ActionResult } from './contacts'

function refresh() {
  revalidatePath('/ayarlar')
  revalidatePath('/kisiler', 'layout')
}

export async function uploadLogoAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin()
  const file = formData.get('logo')
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Bir PNG veya JPG dosyası seçin.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = checkLogo(bytes)
  if (!check.ok) return { ok: false, message: check.message }
  const db = await getDb()
  await saveLogo(db, bytes, check.image)
  refresh()
  return { ok: true, message: `Logo kaydedildi (${check.image.width} x ${check.image.height} piksel). Bundan sonraki e-postalarda ve kişisel sayfalarda görünür.` }
}

export async function removeLogoAction(): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  await removeLogo(db)
  refresh()
  return { ok: true, message: 'Varsayılan Wiener Labs işaretine dönüldü.' }
}

export async function setLogoNameAction(show: boolean): Promise<ActionResult> {
  await requireAdmin()
  const db = await getDb()
  await setShowCompanyName(db, Boolean(show))
  refresh()
  return { ok: true, message: show ? 'Logonun yanında şirket adı gösterilecek.' : 'Yalnızca logo gösterilecek.' }
}
