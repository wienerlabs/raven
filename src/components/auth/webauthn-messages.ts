export function webauthnMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : ''
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : ''
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || name === 'InvalidStateError') return 'Bu cihaz zaten ekli. Doğrudan Face ID ile giriş yapabilirsiniz.'
  if (name === 'NotAllowedError') return 'Face ID onayı iptal edildi ya da süresi doldu.'
  if (name === 'AbortError') return 'İşlem durduruldu.'
  if (name === 'SecurityError' || code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID') return 'Face ID bu adreste çalışmıyor. Raven\'ı kendi alan adından açıp tekrar deneyin.'
  return 'Face ID doğrulaması tamamlanamadı. Tekrar deneyin.'
}
