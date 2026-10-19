'use client'

import { useMemo } from 'react'
import { usePortfolio } from '@/hooks/usePortfolio'
import { usePrices } from '@/hooks/usePrices'
import { computePositionRows, formatPct, pnlColor } from '@/lib/portfolio'
import { squarify } from '@/lib/treemap'

const LAYOUT_W = 1000
const LAYOUT_H = 600

export function PortfolioHeatmap() {
  const portfolio = usePortfolio()
  const { prices } = usePrices()

  const tiles = useMemo(() => {
    if (!portfolio) return []
    const rows = computePositionRows(portfolio, prices)
    const byTicker = new Map(rows.map((r) => [r.ticker, r]))
    return squarify(
      rows.map((r) => ({ key: r.ticker, value: r.marketValue })),
      LAYOUT_W,
      LAYOUT_H,
    ).flatMap((rect) => {
      const row = byTicker.get(rect.key)
      return row ? [{ rect, row }] : []
    })
  }, [portfolio, prices])

  if (tiles.length === 0) {
    return (
      <div data-testid="heatmap-empty" className="flex h-full items-center justify-center text-muted/60">
        {portfolio ? 'No positions yet' : 'Loading…'}
      </div>
    )
  }

  return (
    <div data-testid="heatmap" className="relative h-full min-h-24 w-full">
      {tiles.map(({ rect, row }) => (
        <div
          key={row.ticker}
          data-testid={`heatmap-tile-${row.ticker}`}
          title={`${row.ticker}: ${(row.weight * 100).toFixed(1)}% of positions`}
          className="absolute overflow-hidden border border-bg p-1 leading-tight"
          style={{
            left: `${(rect.x / LAYOUT_W) * 100}%`,
            top: `${(rect.y / LAYOUT_H) * 100}%`,
            width: `${(rect.w / LAYOUT_W) * 100}%`,
            height: `${(rect.h / LAYOUT_H) * 100}%`,
            backgroundColor: pnlColor(row.pnlPct),
          }}
        >
          <div className="font-semibold text-fg">{row.ticker}</div>
          <div className="text-[11px] text-fg/80">{formatPct(row.pnlPct)}</div>
        </div>
      ))}
    </div>
  )
}
