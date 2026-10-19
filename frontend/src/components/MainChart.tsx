'use client'

import { usePrices } from '@/hooks/usePrices'
import { useSelectedTicker } from '@/hooks/useSelectedTicker'
import { formatPct, formatUsd } from '@/lib/portfolio'
import { linePoints } from './Sparkline'

const W = 100
const H = 40

export function MainChart() {
  const [ticker] = useSelectedTicker()
  const { prices, history, open } = usePrices()

  if (!ticker) {
    return (
      <div data-testid="chart-empty" className="flex h-full items-center justify-center text-muted/60">
        Select a ticker
      </div>
    )
  }

  const values = history[ticker] ?? []
  const tick = prices[ticker]
  const base = open[ticker]
  const change = tick && base ? ((tick.price - base) / base) * 100 : null
  const tone = change === null || change === 0 ? 'text-fg' : change > 0 ? 'text-up' : 'text-down'

  return (
    <div className="flex h-full min-h-32 flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span data-testid="chart-ticker" className="text-base font-semibold text-accent">
          {ticker}
        </span>
        <span data-testid="chart-price" className="text-base">
          {tick ? formatUsd(tick.price) : '—'}
        </span>
        <span className={tone}>{change === null ? '' : formatPct(change)}</span>
      </div>
      {values.length < 2 ? (
        <div data-testid="chart-collecting" className="flex flex-1 items-center justify-center text-muted/60">
          Collecting price data…
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <svg
            data-testid="main-chart"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            role="img"
            aria-label={`${ticker} price since page load`}
          >
            <polyline
              data-testid="chart-line"
              points={linePoints(values, W, H)}
              fill="none"
              stroke={values[values.length - 1] >= values[0] ? 'var(--color-up)' : 'var(--color-down)'}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="absolute left-1 top-0 text-[10px] text-muted">{formatUsd(Math.max(...values))}</span>
          <span className="absolute bottom-0 left-1 text-[10px] text-muted">{formatUsd(Math.min(...values))}</span>
        </div>
      )}
    </div>
  )
}
