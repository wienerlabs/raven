import type Anthropic from '@anthropic-ai/sdk'
import { aiModel } from '@/lib/env'
import { pitchJsonSchema, type Pitch } from '@/lib/pitch/schema'
import { checkPitch, type PitchContext } from '@/lib/pitch/validate'
import { buildPitchUserPrompt, PITCH_SYSTEM_PROMPT, type PitchInput } from './prompt'
import { anthropic } from './client'

export interface GeneratedPitch {
  pitch: Pitch
  warnings: string[]
  model: string
  attempts: number
}

function toolSchema(): Anthropic.Tool.InputSchema {
  const schema: Record<string, unknown> = { ...(pitchJsonSchema as Record<string, unknown>) }
  delete schema.$schema
  return { ...schema, type: 'object' } as Anthropic.Tool.InputSchema
}

export async function generatePitch(input: PitchInput, context: PitchContext, options: { model?: string; maxAttempts?: number } = {}): Promise<GeneratedPitch> {
  const api = await anthropic()
  const model = options.model ?? aiModel()
  const maxAttempts = options.maxAttempts ?? 3
  const tool: Anthropic.Tool = {
    name: 'submit_pitch',
    description: 'Submit the complete personalized outreach pitch for this contact.',
    input_schema: toolSchema(),
  }
  const conversation: Anthropic.MessageParam[] = [{ role: 'user', content: buildPitchUserPrompt(input) }]
  let lastErrors: string[] = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await api.messages.create({
      model,
      max_tokens: 8000,
      system: [{ type: 'text', text: PITCH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: conversation,
    })
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    if (!toolUse) {
      lastErrors = ['the model did not call submit_pitch']
      conversation.push({ role: 'assistant', content: response.content })
      conversation.push({ role: 'user', content: 'Call submit_pitch with the complete object.' })
      continue
    }
    const check = checkPitch(toolUse.input, context)
    if (check.ok && check.pitch) return { pitch: check.pitch, warnings: check.warnings, model, attempts: attempt }
    lastErrors = check.errors
    conversation.push({ role: 'assistant', content: response.content })
    conversation.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: `The pitch failed validation. Fix every problem and call submit_pitch again with the full corrected object:\n${check.errors.map((error) => `- ${error}`).join('\n')}`,
        },
      ],
    })
  }
  throw new Error(`Pitch generation failed after ${maxAttempts} attempts: ${lastErrors.join('; ')}`)
}
