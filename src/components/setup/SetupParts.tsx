'use client'

import { useState, type ReactNode } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'

export function CopyField({ label, value, empty = 'Kaydettiğinizde oluşur' }: { label: string; value: string; empty?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-soft px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 break-all text-ink">{value || empty}</span>
        {value ? (
          <button
            type="button"
            className="chip shrink-0"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(value)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function Capability({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (on ? 'bg-accent-strong' : 'bg-line')} aria-hidden />
      <span>
        <span className="block text-sm text-ink">
          {label} <span className="text-xs text-mute">{on ? 'açık' : 'kapalı'}</span>
        </span>
        <span className="block text-xs text-mute">{detail}</span>
      </span>
    </li>
  )
}

export interface SetupStep<K extends string> {
  key: K
  title: string
  summary: string
  optional?: boolean
  body: ReactNode
}

export function StepList<K extends string>({ steps, done, openKey, onToggle }: { steps: Array<SetupStep<K>>; done: Record<K, boolean>; openKey: K | null; onToggle: (key: K) => void }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const open = openKey === step.key
        const complete = done[step.key]
        return (
          <li key={step.key} className={'rounded-3xl border bg-surface transition ' + (open ? 'border-accent-strong' : 'border-line')}>
            <button type="button" onClick={() => onToggle(step.key)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left">
              <span className={'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ' + (complete ? 'border-accent bg-accent text-on-accent' : 'border-line bg-canvas text-mute')}>
                {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-ink">{step.title}</span>
                <span className="block truncate text-xs text-mute">{step.summary}</span>
              </span>
              {step.optional ? <span className="pill hidden sm:inline-flex">İsteğe bağlı</span> : null}
              <ChevronDown className={'h-4 w-4 shrink-0 text-mute transition ' + (open ? 'rotate-180' : '')} />
            </button>
            {open ? <div className="border-t border-line px-5 pb-5 pt-4">{step.body}</div> : null}
          </li>
        )
      })}
    </ol>
  )
}
