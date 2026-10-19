'use client'

import { usePortfolioHistory } from '@/hooks/usePortfolioHistory'
import { formatUsd } from '@/lib/portfolio'

const W = 100
const H = 40

export function PnlChart() {
  const history = usePortfolioHistory()

  if (history.length < 2) {
    return (
      <div data-testid="pnl-empty" className="flex h-full items-center justify-center text-muted/60">
        Collecting portfolio history…
      </div>
    )
  }

  const values = history.map((s) => s.total_value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(2)},${(H - ((v - min) / span) * H).toFixed(2)}`)
    .join(' ')
  const up = values[values.length - 1] >= values[0]

  return (
    <div className="relative h-full min-h-24 w-full">
      <svg
        data-testid="pnl-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        role="img"
        aria-label="Portfolio value over time"
      >
        <polyline
          data-testid="pnl-line"
          points={points}
          fill="none"
          stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="absolute left-1 top-0 text-[10px] text-muted">{formatUsd(max)}</span>
      <span className="absolute bottom-0 left-1 text-[10px] text-muted">{formatUsd(min)}</span>
    </div>
  )
}
