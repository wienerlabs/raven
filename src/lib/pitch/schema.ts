import { z } from 'zod'

export const languageSchema = z.enum(['tr', 'en'])
export type Language = z.infer<typeof languageSchema>

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true
  }
  return false
}

function hasLineBreaks(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code === 10 || code === 13 || code === 8232 || code === 8233) return true
  }
  return false
}

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !hasControlCharacters(value), 'control characters are not allowed')

const line = (min: number, max: number) => text(min, max).refine((value) => !hasLineBreaks(value), 'must be a single line')

export const pitchSchema = z.object({
  language: languageSchema,
  person: z.object({
    firstName: line(1, 40),
    lastName: z.string().trim().max(60).refine((value) => !hasControlCharacters(value) && !hasLineBreaks(value), 'must be a single line'),
    greetingName: line(1, 60),
    salutation: line(3, 90),
  }),
  company: z.object({
    name: line(1, 80),
    sector: line(2, 60),
    summary: text(10, 280),
    confidence: z.enum(['high', 'medium', 'low']),
  }),
  solution: z.object({
    name: line(3, 48),
    tagline: text(10, 160),
    problem: text(40, 460),
    steps: z
      .array(z.object({ title: line(2, 40), detail: text(10, 170) }))
      .length(3),
    capabilities: z.array(text(10, 120)).length(3),
    integrations: z.array(text(2, 48)).min(2).max(5),
    pilot: z.object({
      duration: line(3, 30),
      scope: text(20, 280),
      deliverable: text(10, 220),
    }),
    kpis: z.array(text(8, 120)).min(2).max(3),
    security: text(20, 260),
  }),
  email: z.object({
    subject: line(8, 64),
    subjectAlt: line(8, 64),
    preheader: line(20, 130),
    opening: text(30, 340),
    body: text(80, 760),
    cta: text(20, 240),
    ps: text(20, 240),
  }),
  followUps: z.array(z.object({ body: text(60, 520) })).length(2),
  whatsapp: text(80, 680),
  landing: z.object({
    headline: line(12, 90),
    subheadline: text(30, 240),
    faq: z
      .array(z.object({ q: text(8, 130), a: text(20, 380) }))
      .length(3),
  }),
  flags: z.array(z.string().trim().min(2).max(60)).max(8),
})

export type Pitch = z.infer<typeof pitchSchema>

export const pitchJsonSchema = z.toJSONSchema(pitchSchema)
