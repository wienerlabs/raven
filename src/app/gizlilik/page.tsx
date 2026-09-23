import type { Metadata } from 'next'
import Image from 'next/image'
import { getDb } from '@/lib/db'
import { getSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: { absolute: 'Aydınlatma metni · Wiener Labs' } }

export default async function PrivacyPage() {
  const db = await getDb()
  const settings = await getSettings(db)
  const { legal } = settings
  const controller = [legal.companyName || settings.sender.company, legal.address, legal.mersis ? `MERSİS: ${legal.mersis}` : ''].filter(Boolean).join(', ')
  const contactEmail = legal.contactEmail
  return (
    <div className="light-scope relative min-h-screen">
      <div className="raven-backdrop" aria-hidden />
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        <div className="flex items-center gap-2.5 text-lg tracking-tight text-ink">
          <Image src="/brand/wiener-mark-256.png" alt="" width={24} height={24} className="h-6 w-6" />
          {settings.sender.company}
        </div>
        <article className="card mt-8 space-y-6 p-8 text-sm leading-7 text-body">
          <div>
            <h1 className="text-3xl tracking-tight text-ink">İş iletişimi aydınlatma metni</h1>
            <p className="mt-2 text-mute">6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında bilgilendirme.</p>
          </div>
          <section>
            <h2 className="text-base text-ink">Veri sorumlusu</h2>
            <p>{controller}</p>
          </section>
          <section>
            <h2 className="text-base text-ink">İşlenen veriler ve kaynağı</h2>
            <p>
              Adınız, soyadınız, ünvanınız, çalıştığınız şirket ve iş iletişim bilgileriniz (iş e-postası, varsa iş telefonu). Bu bilgiler {settings.partnerName ? `iş ortağımız ${settings.partnerName}` : 'iş ortağımız'} aracılığıyla, mesleki rolünüze ilişkin iş iletişimi amacıyla edinilmiştir. Mesajlarımıza verdiğiniz yanıtlar ve sizin için hazırlanan sayfadaki tercihleriniz de kaydedilir.
            </p>
          </section>
          <section>
            <h2 className="text-base text-ink">Amaç ve hukuki sebep</h2>
            <p>
              Verileriniz, şirketinizin faaliyet alanına uygun yazılım ve yapay zekâ çözümleri hakkında sizinle iş iletişimi kurmak, taleplerinizi yanıtlamak ve iletişim tercihlerinizi (listeden çıkma dahil) uygulamak amacıyla, KVKK madde 5/2-f uyarınca meşru menfaatimiz kapsamında işlenir.
            </p>
          </section>
          <section>
            <h2 className="text-base text-ink">Aktarım</h2>
            <p>
              Verileriniz yalnızca bu iletişimin yürütülmesi için hizmet aldığımız e-posta, barındırma ve veritabanı sağlayıcılarıyla, gerekli teknik ve idari tedbirler alınarak paylaşılır. Üçüncü kişilere satılmaz veya pazarlama amacıyla devredilmez.
            </p>
          </section>
          <section>
            <h2 className="text-base text-ink">Saklama süresi</h2>
            <p>İletişim sona erdikten veya listeden çıkma talebinizden sonra verileriniz silinir; yalnızca size tekrar yazmamamızı sağlamak için e-posta adresiniz engelleme listesinde tutulur.</p>
          </section>
          <section>
            <h2 className="text-base text-ink">Haklarınız</h2>
            <p>
              KVKK madde 11 kapsamında verilerinizin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme ve işlemeye itiraz etme haklarına sahipsiniz. Her e-postanın altındaki bağlantıyla tek tıkla listeden çıkabilirsiniz.
              {contactEmail ? ` Başvurularınız için: ${contactEmail}` : ''}
            </p>
          </section>
        </article>
      </main>
    </div>
  )
}
