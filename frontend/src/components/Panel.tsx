import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  className?: string
  actions?: ReactNode
  children?: ReactNode
}

export function Panel({ title, className = '', actions, children }: PanelProps) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 flex-col border border-border bg-surface ${className}`}
    >
      <header className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </section>
  )
}

export function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-muted/60">{label}</div>
  )
}
