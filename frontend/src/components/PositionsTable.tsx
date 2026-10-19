'use client'

import { usePortfolio } from '@/hooks/usePortfolio'
import { usePrices } from '@/hooks/usePrices'
import {
  computePositionRows,
  formatPct,
  formatQty,
  formatSignedUsd,
  formatUsd,
} from '@/lib/portfolio'

const COLUMNS = ['Ticker', 'Qty', 'Avg Cost', 'Price', 'P&L', '%']

export function PositionsTable() {
  const portfolio = usePortfolio()
  const { prices } = usePrices()
  const rows = portfolio ? computePositionRows(portfolio, prices) : []

  return (
    <table className="w-full text-right text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-muted">
          {COLUMNS.map((c, i) => (
            <th key={c} className={`pb-1 font-normal ${i === 0 ? 'text-left' : ''}`}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td data-testid="positions-empty" colSpan={COLUMNS.length} className="py-3 text-center text-muted/60">
              {portfolio ? 'No positions yet' : 'Loading…'}
            </td>
          </tr>
        ) : (
          rows.map((r) => {
            const tone = r.pnl > 0 ? 'text-up' : r.pnl < 0 ? 'text-down' : 'text-fg'
            return (
              <tr key={r.ticker} data-testid={`position-${r.ticker}`} className="border-t border-border/50">
                <td className="py-0.5 text-left font-semibold text-accent">{r.ticker}</td>
                <td>{formatQty(r.quantity)}</td>
                <td>{formatUsd(r.avgCost)}</td>
                <td>{formatUsd(r.price)}</td>
                <td className={tone}>{formatSignedUsd(r.pnl)}</td>
                <td className={tone}>{formatPct(r.pnlPct)}</td>
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
