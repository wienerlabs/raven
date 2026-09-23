import type { Language } from '@/lib/pitch/schema'

export interface LandingCopy {
  preparedFor: (company: string) => string
  briefLabel: string
  meetingCta: string
  infoCta: string
  preparedBy: string
  forLabel: string
  problemLabel: string
  systemLabel: string
  howLabel: string
  capabilitiesLabel: string
  pilotLabel: string
  pilotDuration: string
  pilotScope: string
  pilotDeliverable: string
  kpiLabel: string
  integrationLabel: string
  securityLabel: string
  faqLabel: string
  closingTitle: string
  closingBody: (sender: string) => string
  calendarCta: string
  noteTitle: string
  notePlaceholder: string
  contactPlaceholder: string
  noteSubmit: string
  footerPersonal: (name: string) => string
  privacy: string
  unsubscribe: string
  intentTitles: Record<'meeting' | 'info' | 'later', string>
  intentBodies: Record<'meeting' | 'info' | 'later', (sender: string) => string>
  backToBrief: string
  saved: string
  referralPlaceholder: string
  slotsPlaceholder: string
  infoPlaceholder: string
}

export const landingCopy: Record<Language, LandingCopy> = {
  tr: {
    preparedFor: (company) => `${company} için hazırlandı`,
    briefLabel: 'Kişisel çözüm taslağı',
    meetingCta: 'Görüşme planlayalım',
    infoCta: 'Önce detay gönderin',
    preparedBy: 'Hazırlayan',
    forLabel: 'Kime',
    problemLabel: 'Gördüğümüz sorun',
    systemLabel: 'Önerdiğimiz sistem',
    howLabel: 'Nasıl çalışır',
    capabilitiesLabel: 'Neler yapar',
    pilotLabel: 'Pilot planı',
    pilotDuration: 'Süre',
    pilotScope: 'Kapsam',
    pilotDeliverable: 'Pilot sonunda elinizde',
    kpiLabel: 'Ölçeceğimiz metrikler',
    integrationLabel: 'Bağlandığı sistemler',
    securityLabel: 'Veri güvenliği',
    faqLabel: 'Sık sorulanlar',
    closingTitle: '20 dakikada pilotu birlikte netleştirelim.',
    closingBody: (sender) => `Kapsamı, verileri ve başarı ölçütünü birlikte belirleyelim. ${sender} size bir iş günü içinde dönüş yapar.`,
    calendarCta: 'Takvimden saat seçin',
    noteTitle: 'Bir not bırakın',
    notePlaceholder: 'Sorunuz, uygun olduğunuz saatler veya pilotta görmek istediğiniz şey',
    contactPlaceholder: 'Size nasıl ulaşalım? (telefon, e-posta veya asistan)',
    noteSubmit: 'Gönder',
    footerPersonal: (name) => `Bu sayfa yalnızca ${name} için hazırlandı.`,
    privacy: 'Aydınlatma metni',
    unsubscribe: 'Bir daha yazmayalım',
    intentTitles: { meeting: 'Harika, görüşelim.', info: 'Detayları hazırlıyoruz.', later: 'Anlaşıldı, teşekkürler.' },
    intentBodies: {
      meeting: (sender) => `${sender} bir iş günü içinde size dönecek. Dilerseniz uygun olduğunuz saati hemen seçin ya da aşağıya yazın.`,
      info: (sender) => `Pilot kapsamını ve örnek çıktıları içeren kısa bir özeti ${sender} e-postanıza gönderecek. Özellikle merak ettiğiniz bir konu varsa yazın.`,
      later: () => 'Bu konuda sizi tekrar rahatsız etmeyeceğiz. Taslak sayfası sizin için açık kalacak; ileride dönmek isterseniz buradayız.',
    },
    backToBrief: 'Taslağa dön',
    saved: 'Yanıtınız kaydedildi.',
    referralPlaceholder: 'Bu konu için doğru kişi başka biriyse adını yazabilirsiniz',
    slotsPlaceholder: 'Uygun gün ve saatler',
    infoPlaceholder: 'Özellikle görmek istediğiniz konu',
  },
  en: {
    preparedFor: (company) => `Prepared for ${company}`,
    briefLabel: 'Personal solution brief',
    meetingCta: "Let's schedule a call",
    infoCta: 'Send details first',
    preparedBy: 'Prepared by',
    forLabel: 'For',
    problemLabel: 'The problem we see',
    systemLabel: 'The system we propose',
    howLabel: 'How it works',
    capabilitiesLabel: 'What it does',
    pilotLabel: 'Pilot plan',
    pilotDuration: 'Duration',
    pilotScope: 'Scope',
    pilotDeliverable: 'What you hold at the end',
    kpiLabel: 'Metrics we will measure',
    integrationLabel: 'Systems it connects to',
    securityLabel: 'Data security',
    faqLabel: 'Questions',
    closingTitle: 'Shape the pilot together in 20 minutes.',
    closingBody: (sender) => `We will agree on scope, data and the success metric together. ${sender} will get back to you within one business day.`,
    calendarCta: 'Pick a time',
    noteTitle: 'Leave a note',
    notePlaceholder: 'Your question, times that work, or what you want to see in the pilot',
    contactPlaceholder: 'How should we reach you? (phone, email or assistant)',
    noteSubmit: 'Send',
    footerPersonal: (name) => `This page was prepared only for ${name}.`,
    privacy: 'Privacy notice',
    unsubscribe: 'Do not email me again',
    intentTitles: { meeting: "Great, let's talk.", info: 'We are preparing the details.', later: 'Understood, thank you.' },
    intentBodies: {
      meeting: (sender) => `${sender} will get back to you within one business day. You can also pick a time right away or write below.`,
      info: (sender) => `${sender} will email you a short summary with the pilot scope and sample outputs. Tell us if there is something specific you want to see.`,
      later: () => 'We will not bother you about this again. The brief stays available if you want to come back to it later.',
    },
    backToBrief: 'Back to the brief',
    saved: 'Your answer has been saved.',
    referralPlaceholder: 'If someone else owns this topic, you can share their name',
    slotsPlaceholder: 'Days and times that work',
    infoPlaceholder: 'Anything specific you want to see',
  },
}
