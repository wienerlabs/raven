import type { Intent, MessageStatus, ReviewStatus, Stage } from '@/lib/db/schema'
import { flagLabels, intentLabels, messageStatusLabels, reviewLabels, stageLabels } from '@/lib/labels'

const base = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs'

const tone = {
  accent: 'border-accent bg-accent text-on-accent',
  accentSoft: 'border-accent bg-accent-soft text-ink',
  soft: 'border-line bg-soft text-mute',
  outline: 'border-line bg-surface text-ink',
  faint: 'border-line bg-surface text-mute line-through decoration-mute/60',
} as const

const reviewTone: Record<ReviewStatus, keyof typeof tone> = { approved: 'accent', pending: 'soft', hold: 'outline', excluded: 'faint' }

const stageTone: Record<Stage, keyof typeof tone> = {
  new: 'soft',
  queued: 'outline',
  contacted: 'outline',
  engaged: 'accentSoft',
  replied: 'accent',
  meeting: 'accent',
  declined: 'soft',
  unsubscribed: 'faint',
  bounced: 'faint',
}

const intentTone: Record<Intent, keyof typeof tone> = { meeting: 'accent', info: 'accentSoft', later: 'soft', not_interested: 'soft', other: 'outline' }

const messageTone: Record<MessageStatus, keyof typeof tone> = { scheduled: 'outline', sending: 'accentSoft', sent: 'accent', failed: 'outline', cancelled: 'faint', manual: 'accentSoft' }

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  return <span className={`${base} ${tone[reviewTone[status]]}`}>{status === 'hold' ? <span aria-hidden>!</span> : null}{reviewLabels[status]}</span>
}

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`${base} ${tone[stageTone[stage]]}`}>
      {stage === 'meeting' ? <span className="live-dot" style={{ width: 6, height: 6 }} /> : null}
      {stageLabels[stage]}
    </span>
  )
}

export function IntentBadge({ intent }: { intent: Intent }) {
  return <span className={`${base} ${tone[intentTone[intent]]}`}>{intentLabels[intent]}</span>
}

export function MessageBadge({ status }: { status: MessageStatus }) {
  return <span className={`${base} ${tone[messageTone[status]]}`}>{status === 'failed' ? <span aria-hidden>!</span> : null}{messageStatusLabels[status]}</span>
}

export function FlagBadge({ flag }: { flag: string }) {
  return <span className={`${base} ${tone.soft}`}>{flagLabels[flag] ?? flag}</span>
}
