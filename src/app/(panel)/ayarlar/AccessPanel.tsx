'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, KeyRound, ScanFace, Smartphone, UserPlus } from 'lucide-react'
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser'
import { createInviteAction, passkeyRegisterOptions, passkeyRegisterVerify, removeMemberAction, removePasskeyAction, revokeInviteAction, setPasswordLoginAction } from '@/app/actions/passkeys'
import { MotionButton } from '@/components/ui/MotionButton'
import { webauthnMessage } from '@/components/auth/webauthn-messages'

export interface AccessMember {
  id: string
  name: string
  lastLoginAt: string | null
  passkeys: Array<{ id: string; label: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean }>
}

export interface AccessInvite {
  id: string
  name: string
  expiresAt: string
}

const NEW = 'new'

function formatDate(value: string | null): string {
  if (!value) return 'Henüz yok'
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(value))
}

function MemberPicker({ members, value, onChange, name, onName }: { members: AccessMember[]; value: string; onChange: (value: string) => void; name: string; onName: (value: string) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className="select" value={value} onChange={(event) => onChange(event.target.value)} aria-label="Kişi">
        <option value={NEW}>Yeni kişi</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      {value === NEW ? <input className="input py-2.5 text-sm" placeholder="Ad Soyad" value={name} onChange={(event) => onName(event.target.value)} maxLength={60} /> : null}
    </div>
  )
}

export function AccessPanel({ members, invites, viewerMemberId, viewerName, passwordLogin, canLockToPasskeys }: { members: AccessMember[]; invites: AccessInvite[]; viewerMemberId: string | null; viewerName: string; passwordLogin: boolean; canLockToPasskeys: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [deviceFor, setDeviceFor] = useState(viewerMemberId ?? NEW)
  const [deviceName, setDeviceName] = useState('')
  const [inviteFor, setInviteFor] = useState(NEW)
  const [inviteName, setInviteName] = useState('')
  const [inviteLink, setInviteLink] = useState<{ link: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const addThisDevice = () =>
    startTransition(async () => {
      setNotice(null)
      if (!browserSupportsWebAuthn()) {
        setNotice('Bu tarayıcı Face ID kurulumunu desteklemiyor.')
        return
      }
      try {
        const begin = await passkeyRegisterOptions(deviceFor === NEW ? { name: deviceName } : { memberId: deviceFor })
        if (!begin.ok) {
          setNotice(begin.message)
          return
        }
        const credential = await startRegistration({ optionsJSON: begin.options })
        const result = await passkeyRegisterVerify(credential)
        setNotice(result.message ?? null)
        if (result.ok) {
          setDeviceName('')
          router.refresh()
        }
      } catch (failure) {
        setNotice(webauthnMessage(failure))
      }
    })

  const createInvite = () =>
    startTransition(async () => {
      setNotice(null)
      setCopied(false)
      const result = await createInviteAction(inviteFor === NEW ? { name: inviteName } : { memberId: inviteFor })
      if (!result.ok) {
        setNotice(result.message)
        return
      }
      setInviteLink({ link: result.link, expiresAt: result.expiresAt })
      setInviteName('')
      router.refresh()
    })

  const act = (task: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await task()
      setNotice(result.message ?? null)
      setConfirming(null)
      setConfirmText('')
      router.refresh()
    })

  const copy = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section id="erisim" className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg text-ink">
            <ScanFace className="h-5 w-5" /> Face ID ile giriş
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-mute">
            Her ekip üyesi kendi telefonundaki ya da bilgisayarındaki Face ID, Touch ID veya Windows Hello ile girer. Yüz verisi cihazdan çıkmaz, Raven&apos;a yalnızca cihazın imzası gelir; fotoğraf saklanmaz.
          </p>
        </div>
        <span className="pill">{viewerName} olarak açık</span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-line p-5">
          <div className="flex items-center gap-2 text-sm text-ink">
            <Smartphone className="h-4 w-4" /> Bu cihazı ekle
          </div>
          <p className="mt-1 text-xs text-mute">Şu an kullandığınız telefon ya da bilgisayar kaydedilir.</p>
          <div className="mt-4 space-y-3">
            {viewerMemberId ? null : <MemberPicker members={members} value={deviceFor} onChange={setDeviceFor} name={deviceName} onName={setDeviceName} />}
            <MotionButton small onClick={addThisDevice} disabled={pending}>
              <ScanFace className="h-3.5 w-3.5" /> Bu cihaza Face ID ekle
            </MotionButton>
          </div>
        </div>

        <div className="rounded-3xl border border-line p-5">
          <div className="flex items-center gap-2 text-sm text-ink">
            <UserPlus className="h-4 w-4" /> Ekip üyesini davet et
          </div>
          <p className="mt-1 text-xs text-mute">Tek kullanımlık, 48 saat geçerli bir bağlantı. Kişi bağlantıyı kendi telefonunda açıp Face ID&apos;sini tanımlar.</p>
          <div className="mt-4 space-y-3">
            <MemberPicker members={members} value={inviteFor} onChange={setInviteFor} name={inviteName} onName={setInviteName} />
            <MotionButton small variant="ghost" onClick={createInvite} disabled={pending}>
              Davet bağlantısı oluştur
            </MotionButton>
            {inviteLink ? (
              <div className="rounded-2xl bg-soft p-3 text-xs">
                <div className="break-all text-ink">{inviteLink.link}</div>
                <div className="mt-2 flex items-center justify-between gap-2 text-mute">
                  <span>{formatDate(inviteLink.expiresAt)} tarihine kadar</span>
                  <button type="button" onClick={copy} className="chip">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {notice ? (
        <p className="mt-4 text-sm text-ink" role="status">
          {notice}
        </p>
      ) : null}

      <div className="mt-6 space-y-3">
        {members.length === 0 ? <p className="text-sm text-mute">Henüz Face ID tanımlı kimse yok. Önce bu cihazı ekleyin.</p> : null}
        {members.map((member) => (
          <div key={member.id} className="rounded-3xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm text-ink">{member.name}</div>
                <div className="text-xs text-mute">Son giriş: {formatDate(member.lastLoginAt)}</div>
              </div>
              {member.id === viewerMemberId ? (
                <span className="pill">Siz</span>
              ) : confirming === member.id ? (
                <div className="flex items-center gap-2">
                  <input className="input w-28 py-1.5 text-xs" placeholder='"kaldır" yazın' value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
                  <MotionButton small variant="ghost" disabled={pending} onClick={() => act(() => removeMemberAction(member.id, confirmText))}>
                    Onayla
                  </MotionButton>
                </div>
              ) : (
                <button type="button" className="chip" onClick={() => setConfirming(member.id)}>
                  Erişimi kaldır
                </button>
              )}
            </div>
            <ul className="mt-3 divide-y divide-line text-xs">
              {member.passkeys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-ink">
                    {key.label}
                    <span className="ml-2 text-mute">{key.backedUp ? 'Anahtar zinciriyle eşitleniyor' : 'Yalnızca bu cihazda'}</span>
                  </span>
                  <span className="flex items-center gap-3 text-mute">
                    Son kullanım {formatDate(key.lastUsedAt)}
                    <button type="button" className="chip" disabled={pending} onClick={() => act(() => removePasskeyAction(key.id))}>
                      Kaldır
                    </button>
                  </span>
                </li>
              ))}
              {member.passkeys.length === 0 ? <li className="py-2 text-mute">Kayıtlı cihaz yok.</li> : null}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-line p-5">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex items-center gap-2 text-sm text-ink">
            <KeyRound className="h-4 w-4" /> Giriş yöntemi
          </div>
          <p className="mt-1 text-xs text-mute">
            {passwordLogin
              ? 'Şu an Face ID cihazları ve yönetici şifresi birlikte çalışıyor. Ekip cihazlarını ekledikten sonra şifreyi kapatırsanız panele yalnızca buradaki kişiler girebilir.'
              : 'Yönetici şifresi kapalı: panele yalnızca aşağıdaki kişilerin kayıtlı cihazlarıyla girilir. Tüm cihazlar kaybolursa Vercel ortamında RAVEN_PASSWORD_LOGIN=force ile şifre geçici olarak açılır.'}
          </p>
          {passwordLogin && !canLockToPasskeys ? <p className="mt-2 text-xs text-mute">Kapatmak için önce bu cihaza Face ID ekleyip Face ID ile giriş yapın.</p> : null}
        </div>
        <MotionButton small variant={passwordLogin ? 'primary' : 'ghost'} disabled={pending || (passwordLogin && !canLockToPasskeys)} onClick={() => act(() => setPasswordLoginAction(!passwordLogin))}>
          {passwordLogin ? 'Yalnızca Face ID ile girilsin' : 'Şifreyle girişi yeniden aç'}
        </MotionButton>
      </div>

      {invites.length ? (
        <div className="mt-6">
          <div className="text-xs text-mute">Açık davetler</div>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line text-sm">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-ink">{invite.name}</span>
                <span className="flex items-center gap-3 text-xs text-mute">
                  {formatDate(invite.expiresAt)} tarihine kadar
                  <button type="button" className="chip" disabled={pending} onClick={() => act(() => revokeInviteAction(invite.id))}>
                    İptal et
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
