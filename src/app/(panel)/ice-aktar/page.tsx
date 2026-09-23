import type { Metadata } from 'next'
import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { imports } from '@/lib/db/schema'
import { hasAi } from '@/lib/env'
import { formatDateTime } from '@/lib/labels'
import { importFileAction, importPitchesAction } from '@/app/actions/data'
import { UploadForm } from './UploadForm'

export const metadata: Metadata = { title: 'İçe aktar' }

export default async function ImportPage() {
  const db = await getDb()
  const history = await db.select().from(imports).orderBy(desc(imports.createdAt)).limit(10)
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl tracking-tight text-ink">İçe aktar</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">Excel veya CSV listesi yükleyin. Sütunlar otomatik tanınır: ad, soyad, ünvan, şirket, e-posta, telefon, cep, WhatsApp, mevcut müşteri. Aynı e-posta ikinci kez eklenmez, var olan kayıt güncellenir.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <UploadForm
          action={importFileAction}
          title="Kişi listesi"
          body="Apollo, LinkedIn Sales Navigator veya kendi tablonuz. Yaptırım riski taşıyan ülke alan adları ve onay gerektiren yargı alanları otomatik olarak beklemeye alınır."
          accept=".xlsx,.csv,.tsv,.txt"
          submit="Listeyi yükle"
        />
        <UploadForm
          action={importPitchesAction}
          title="Hazır içerik dosyası"
          body="E-posta adresi anahtarlı JSON içerikleri kalite kontrolünden geçirerek kişilere bağlar. Toplu üretimden gelen dosyalar için kullanılır."
          accept=".json,application/json"
          submit="İçerikleri yükle"
          approveOption
        />
      </div>
      {!hasAi() ? (
        <div className="rounded-3xl border border-line bg-soft px-5 py-4 text-sm text-mute">
          Yeni yüklenen kişiler için içeriklerin otomatik üretilmesi için ortam değişkenlerine ANTHROPIC_API_KEY ekleyin. Anahtar tanımlandığında Kişiler sayfasında &quot;Eksik içerikleri AI ile üret&quot; düğmesi görünür.
        </div>
      ) : null}
      <section className="card">
        <h2 className="text-lg text-ink">Geçmiş yüklemeler</h2>
        {history.length === 0 ? <p className="mt-2 text-sm text-mute">Henüz yükleme yok.</p> : null}
        <ul className="mt-3 divide-y divide-line text-sm">
          {history.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="text-ink">{item.filename}</span>
              <span className="text-xs text-mute">
                {item.created} yeni · {item.updated} güncellendi · {item.skipped} atlandı · {formatDateTime(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
