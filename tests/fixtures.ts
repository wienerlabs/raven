import { examplePitch } from '@/lib/ai/prompt'
import type { Pitch } from '@/lib/pitch/schema'

export function pitchFor(firstName: string, company: string, overrides: Partial<Pitch> = {}): Pitch {
  const base = structuredClone(examplePitch)
  base.person = { firstName, lastName: 'Test', greetingName: firstName, salutation: `Merhaba ${firstName},` }
  base.company = { ...base.company, name: company }
  base.email = { ...base.email, subject: `${company} için kısa bir fikir`, subjectAlt: `${firstName}, ${company} için bir taslak` }
  base.landing = { ...base.landing, headline: `${company} için Rota Asistanı` }
  return { ...base, ...overrides }
}
