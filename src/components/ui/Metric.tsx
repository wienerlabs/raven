export function Metric({ label, value, hint, emphasis = false }: { label: string; value: string | number; hint?: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasis ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-1 text-2xl tracking-tight text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-mute">{hint}</div> : null}
    </div>
  )
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
      <span className="text-mute">{label}</span>
      <span className="text-right text-ink">{value}</span>
    </div>
  )
}

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-mute">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-base text-ink">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-mute">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
