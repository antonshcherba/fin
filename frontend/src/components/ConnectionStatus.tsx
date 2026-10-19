import type { ConnectionStatus as Status } from '@/lib/types'

const STYLES: Record<Status, { dot: string; label: string }> = {
  connected: { dot: 'bg-up', label: 'Connected' },
  connecting: { dot: 'bg-accent', label: 'Connecting' },
  reconnecting: { dot: 'bg-accent', label: 'Reconnecting' },
  disconnected: { dot: 'bg-down', label: 'Disconnected' },
}

export function ConnectionStatus({ status }: { status: Status }) {
  const { dot, label } = STYLES[status]
  return (
    <div className="flex items-center gap-2 text-muted" role="status" aria-label={`Connection: ${label}`}>
      <span data-testid="status-dot" data-status={status} className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="hidden sm:inline">{label}</span>
    </div>
  )
}
