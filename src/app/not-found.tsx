import Image from 'next/image'

export default function NotFound() {
  return (
    <div className="light-scope relative flex min-h-screen items-center justify-center px-5">
      <div className="raven-backdrop" aria-hidden />
      <div className="text-center">
        <Image src="/brand/wiener-mark-256.png" alt="" width={32} height={32} className="mx-auto h-8 w-8" />
        <h1 className="mt-6 text-3xl tracking-tight text-ink">Bu sayfa bulunamadı.</h1>
        <p className="mt-2 text-sm text-mute">Bağlantı eksik kopyalanmış olabilir.</p>
      </div>
    </div>
  )
}
