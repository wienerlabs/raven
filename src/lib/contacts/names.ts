import { foldName, turkishLower, turkishUpperFirst } from '@/lib/text/fold'

const firstNames = `Abdullah Abdulkadir Adem Ahmet Akif Alaattin Alaeddin Ali Alp Alpay Alparslan Alper Alperen Arda Arif Arman Aslı Ayhan Ayşe Aydın Aytaç Aziz Bahadır Bahtiyar Banu Barış Batuhan Baturalp Bekir Berk Berkay Beslan Beyazıt Beytullah Birol Boğaçhan Bora Burak Bülent Büşra Can Canan Candan Cem Cemal Cenk Cengiz Cihan Cömert Cüneyt Çağatay Çağlar Çağrı Çetin Çiğdem Deniz Derya Dilek Dinçer Doğan Doğukan Ebubekir Efe Ege Ekin Elif Elvan Emin Emine Emrah Emre Emrecan Enes Engin Erdal Erdem Erdinç Erdoğan Ergün Erhan Erkan Erkut Erman Ertekin Ertuğrul Esin Evren Eyüp Faruk Fatih Fatma Fehmi Ferhan Ferhat Ferit Fırat Fuat Furkan Gökay Gökalp Gökçe Gökhan Göktuğ Görkem Gözde Gül Gürcan Gürhan Gürkan Güven Habibe Hakan Hakkı Haldun Halil Haluk Hamdullah Hande Harun Hasan Hasancan Hatice Hazım Hüseyin Işıl Irmak İbrahim İhsan İlhan İlkay İlker İnci İrem İsmail Kaan Kadir Kadri Kağan Kamil Kemal Kenan Kerem Kıvanç Koray Kudret Kuntay Kürşat Levent Lütfi Mahmut Mehmet Mert Mete Metin Miraç Muhammed Murat Musa Mustafa Mutlu Mücahit Mümin Müge Nazmi Necmettin Nedim Nurhak Oğuz Oğuzhan Okan Olgun Onur Onurhan Orhan Orkide Osman Ozan Ozanhan Ömer Ömür Özgür Özkan Özlem Pınar Recep Rıfat Rıza Sabri Safa Salih Samet Sami Sarp Selim Selman Semih Sena Sercan Serdal Serdar Serhan Serhat Serkan Sertaç Sibel Sinan Süleyman Şafak Şahin Şenol Şevket Şule Tahsin Tanol Tansel Teoman Timur Tolga Tuğay Tuğba Tuğrul Tuna Turgay Tülay Uğur Ufkun Ufuk Uluç Umut Umutcan Ümit Vehbi Volkan Yağız Yakup Yalçın Yankı Yasin Yavuz Yeliz Yılmaz Yiğit Yusuf Yücel Yüksel Zekeriya Zeynep`
  .split(/\s+/)
  .filter(Boolean)

const lastNames = `Acar Akar Akbulut Akcan Akçay Akdaş Akın Akman Aksoy Aktaş Altay Altıntaş Anaç Arslan Aslan Ateş Avcı Ay Aydın Aydoğan Aydoğmuş Aygün Bahar Bal Balkan Batı Bayrak Bayraklı Bilgin Bilgiç Bulut Büyükoğuz Canbaz Coşkun Çakar Çakır Çelik Çetin Çetintaş Çınar Çiftçi Demir Deniz Dikenli Doğan Doğusoy Durmaz Erdem Erdoğan Eren Ergelen Erkan Güçlü Güdül Gül Güler Güner Güney Güngör Güven Güveli Işık Kaplan Kara Karabaş Karaca Karahan Karakaya Kartal Kaya Kaynak Keskin Kılıç Kılınç Koç Korkmaz Köse Kurt Kurtuluş Kuruköse Metin Oral Oflaz Öz Özbek Özcan Özdemir Özen Özer Özgür Özkan Öztorun Öztürk Polat Sağlam Sarı Sarıhan Sel Sevim Sevinç Sezgin Soyaslan Sökmen Sönmez Sözen Sümer Şahin Şen Şimşek Taş Tekin Tokgöz Toprak Tufan Tuncer Tural Türkmen Tüfekçi Tüzün Uçar Ulusoy Uzun Ünal Yavuz Yaprak Yıldırım Yıldız Yılmaz Yiğit Yücel Yüksel Yunusoğlu`
  .split(/\s+/)
  .filter(Boolean)

const firstIndex = new Map(firstNames.map((name) => [foldName(name), name]))
const lastIndex = new Map(lastNames.map((name) => [foldName(name), name]))

const brokenValues = new Set(['none', 'null', 'undefined', 'nan', 'n/a', 'na', '-', '.', 'tr)', 'tr'])

export function cleanNamePart(value: string | null | undefined): string {
  const trimmed = (value ?? '').replace(/[()[\]{}<>0-9_]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (brokenValues.has(trimmed.toLowerCase())) return ''
  return trimmed
}

function titleCaseToken(token: string): string {
  if (!token) return token
  if (/^[A-ZÇĞİÖŞÜ]\.?$/.test(token)) return token
  return token
    .split('-')
    .map((part) => turkishUpperFirst(turkishLower(part)))
    .join('-')
}

function applySurnameRules(token: string): string {
  return token.replace(/og(u|ue)llar(i|ı)$/i, 'oğulları').replace(/og(lu|lue)$/i, 'oğlu').replace(/^Buyuk|^Bueyuek/, 'Büyük')
}

export function normalizeFirstName(value: string | null | undefined): string {
  const cleaned = cleanNamePart(value)
  return cleaned
    .split(' ')
    .map((token) => firstIndex.get(foldName(token)) ?? titleCaseToken(token))
    .join(' ')
}

export function normalizeLastName(value: string | null | undefined): string {
  const cleaned = cleanNamePart(value)
  return cleaned
    .split(' ')
    .map((token) => lastIndex.get(foldName(token)) ?? applySurnameRules(titleCaseToken(token)))
    .join(' ')
}

export function nameFromEmail(email: string | null | undefined): { first: string; last: string } | null {
  if (!email) return null
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  const parts = local.split(/[._-]+/).filter((part) => /^[a-z]{2,}$/.test(part))
  if (parts.length === 0) return null
  const first = normalizeFirstName(parts[0])
  const last = parts.length > 1 ? normalizeLastName(parts[parts.length - 1]) : ''
  return { first, last }
}

export const genericMailboxes = new Set(['info', 'contact', 'iletisim', 'hello', 'merhaba', 'sales', 'satis', 'destek', 'support', 'office', 'ofis', 'admin', 'istanbul', 'ankara', 'izmir', 'hr', 'ik', 'marketing', 'pazarlama', 'team', 'bilgi'])

export function isGenericMailbox(email: string | null | undefined): boolean {
  if (!email) return false
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  return genericMailboxes.has(local)
}

export function displayName(first: string, last: string): string {
  return [first, last].filter(Boolean).join(' ')
}
