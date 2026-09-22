import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '@/lib/db'
import { contacts, imports } from '@/lib/db/schema'
import { foldTurkish } from '@/lib/text/fold'
import { randomSlug } from '@/lib/security/tokens'
import { assessCompliance } from './compliance'
import { cleanNamePart, nameFromEmail } from './names'
import { normalizePhone } from './phone'

export interface ParsedRow {
  firstName: string
  lastName: string
  title: string | null
  company: string
  companyForEmails: string | null
  email: string | null
  emailStatus: string | null
  phone: string | null
  notes: string | null
  relationship: 'prospect' | 'customer'
}

type Field = keyof ParsedRow | 'fullName' | 'mobile' | 'whatsapp'

const headerAliases: Record<Field, string[]> = {
  firstName: ['firstname', 'first', 'ad', 'adi', 'isim', 'givenname'],
  lastName: ['lastname', 'last', 'soyad', 'soyadi', 'surname', 'familyname'],
  fullName: ['name', 'fullname', 'adsoyad', 'adisoyadi', 'kisi', 'contact', 'contactname'],
  title: ['title', 'jobtitle', 'unvan', 'unvani', 'pozisyon', 'position', 'gorev', 'role'],
  company: ['company', 'companyname', 'sirket', 'sirketadi', 'firma', 'firmaadi', 'organization', 'kurum', 'account', 'accountname'],
  companyForEmails: ['companynameforemails'],
  email: ['email', 'eposta', 'mail', 'emailaddress', 'workemail', 'isepostasi', 'epostaadresi'],
  emailStatus: ['emailstatus', 'epostadurumu'],
  phone: ['phone', 'telefon', 'tel', 'phonenumber', 'corporatephone', 'workdirectphone', 'otherphone', 'isttelefonu', 'sabittelefon'],
  mobile: ['mobile', 'mobilephone', 'cep', 'ceptelefonu', 'gsm', 'cell', 'cellphone'],
  whatsapp: ['whatsapp', 'whatsappnumber', 'wa', 'whatsapptelefonu'],
  notes: ['notes', 'not', 'notlar', 'aciklama', 'description'],
  relationship: ['relationship', 'iliski', 'musteri', 'customer', 'mevcutmusteri', 'existingcustomer'],
}

function normalizeHeader(value: unknown): string {
  return foldTurkish(String(value ?? '')).replace(/[^a-z0-9]/g, '')
}

export function mapHeaders(headers: unknown[]): Partial<Record<Field, number>> {
  const mapping: Partial<Record<Field, number>> = {}
  headers.forEach((header, index) => {
    const key = normalizeHeader(header)
    if (!key) return
    for (const [field, aliases] of Object.entries(headerAliases) as Array<[Field, string[]]>) {
      if (mapping[field] === undefined && aliases.includes(key)) {
        mapping[field] = index
        return
      }
    }
  })
  return mapping
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const record = value as { text?: string; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string }
    if (record.richText) return record.richText.map((part) => part.text).join('')
    if (typeof record.text === 'string') return record.text
    if (record.result !== undefined) return String(record.result)
    if (record.hyperlink) return record.hyperlink.replace(/^mailto:/i, '')
    return ''
  }
  return String(value)
}

const emailCheck = z.email()

function truthy(value: string): boolean {
  return ['1', 'true', 'evet', 'yes', 'x', 'musteri', 'customer', 'mevcut'].includes(foldTurkish(value.trim()))
}

export function rowsFromMatrix(matrix: unknown[][]): { rows: ParsedRow[]; skipped: number; mapping: Partial<Record<Field, number>> } {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell).trim()))
  if (headerIndex < 0) return { rows: [], skipped: 0, mapping: {} }
  const mapping = mapHeaders(matrix[headerIndex].map(cellText))
  const get = (row: unknown[], field: Field) => (mapping[field] === undefined ? '' : cellText(row[mapping[field] as number]).trim())
  const rows: ParsedRow[] = []
  let skipped = 0
  for (const row of matrix.slice(headerIndex + 1)) {
    if (!row.some((cell) => cellText(cell).trim())) continue
    let firstName = cleanNamePart(get(row, 'firstName'))
    let lastName = cleanNamePart(get(row, 'lastName'))
    const fullName = cleanNamePart(get(row, 'fullName'))
    if (!firstName && fullName) {
      const parts = fullName.split(' ')
      lastName = parts.length > 1 ? (parts.pop() ?? '') : ''
      firstName = parts.join(' ')
    }
    const rawEmail = get(row, 'email').toLowerCase().replace(/^mailto:/, '')
    const email = emailCheck.safeParse(rawEmail).success ? rawEmail : null
    const phone = normalizePhone(get(row, 'whatsapp') || get(row, 'mobile') || get(row, 'phone'))
    if (!firstName) {
      const derived = nameFromEmail(email)
      firstName = derived?.first ?? ''
      if (!lastName) lastName = derived?.last ?? ''
    }
    const company = get(row, 'company') || get(row, 'companyForEmails')
    if ((!email && !phone) || !firstName || !company) {
      skipped += 1
      continue
    }
    const title = get(row, 'title')
    rows.push({
      firstName,
      lastName,
      title: title && title.toLowerCase() !== 'none' ? title : null,
      company,
      companyForEmails: get(row, 'companyForEmails') || null,
      email,
      emailStatus: get(row, 'emailStatus') || null,
      phone,
      notes: get(row, 'notes') || null,
      relationship: truthy(get(row, 'relationship')) ? 'customer' : 'prospect',
    })
  }
  return { rows, skipped, mapping }
}

export async function parseSpreadsheet(data: ArrayBuffer | Uint8Array, filename: string): Promise<{ rows: ParsedRow[]; skipped: number; mapping: Partial<Record<Field, number>> }> {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const Papa = (await import('papaparse')).default
    const text = new TextDecoder('utf-8').decode(data instanceof Uint8Array ? data : new Uint8Array(data))
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true })
    return rowsFromMatrix(parsed.data)
  }
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const buffer = data instanceof Uint8Array ? data : new Uint8Array(data)
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { rows: [], skipped: 0, mapping: {} }
  const matrix: unknown[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[]
    matrix.push(values.slice(1))
  })
  return rowsFromMatrix(matrix)
}

export interface ImportSummary {
  importId: string
  created: number
  updated: number
  skipped: number
  held: number
}

export async function importContacts(db: Database, rows: ParsedRow[], filename: string, skippedBefore = 0): Promise<ImportSummary> {
  const inserted = await db.insert(imports).values({ filename, rowCount: rows.length + skippedBefore }).returning({ id: imports.id })
  const importId = inserted[0].id
  let created = 0
  let updated = 0
  let held = 0
  let skipped = skippedBefore
  for (const row of rows) {
    const domain = row.email ? (row.email.split('@')[1] ?? null) : null
    const existing = row.email
      ? await db.select().from(contacts).where(eq(contacts.email, row.email)).limit(1)
      : row.phone
        ? await db.select().from(contacts).where(eq(contacts.phone, row.phone)).limit(1)
        : []
    const compliance = assessCompliance({ email: row.email, domain, company: row.company, title: row.title })
    if (existing[0]) {
      const current = existing[0]
      await db
        .update(contacts)
        .set({
          title: row.title ?? current.title,
          company: row.company || current.company,
          companyForEmails: row.companyForEmails ?? current.companyForEmails,
          emailStatus: row.emailStatus ?? current.emailStatus,
          phone: current.phone ?? row.phone,
          relationship: row.relationship === 'customer' ? 'customer' : current.relationship,
          notes: row.notes ?? current.notes,
          flags: [...new Set([...current.flags, ...compliance.flags])],
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, current.id))
      updated += 1
      continue
    }
    const hold = compliance.holdReason !== null
    if (hold) held += 1
    try {
      await db.insert(contacts).values({
        slug: randomSlug(10),
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        company: row.company,
        companyForEmails: row.companyForEmails,
        email: row.email,
        emailStatus: row.emailStatus,
        phone: row.phone,
        domain,
        relationship: row.relationship,
        reviewStatus: hold ? 'hold' : 'pending',
        holdReason: compliance.holdReason,
        notes: row.notes,
        flags: compliance.flags,
        importId,
      })
      created += 1
    } catch {
      skipped += 1
    }
  }
  await db.update(imports).set({ created, updated, skipped }).where(eq(imports.id, importId))
  return { importId, created, updated, skipped, held }
}
