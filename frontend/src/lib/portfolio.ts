import type { Portfolio, PriceTick } from './types'

export function computeTotalValue(portfolio: Portfolio, prices: Record<string, PriceTick>): number {
  const positions = portfolio.positions.reduce(
    (sum, p) => sum + p.quantity * (prices[p.ticker]?.price ?? p.avg_cost),
    0,
  )
  return portfolio.cash_balance + positions
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export const formatUsd = (n: number) => usd.format(n)

export interface PositionRow {
  ticker: string
  quantity: number
  avgCost: number
  price: number
  marketValue: number
  pnl: number
  pnlPct: number
  weight: number
}

export function computePositionRows(
  portfolio: Portfolio,
  prices: Record<string, PriceTick>,
): PositionRow[] {
  const rows = portfolio.positions
    .filter((p) => p.quantity > 0)
    .map((p) => {
      const price = prices[p.ticker]?.price ?? p.avg_cost
      const cost = p.quantity * p.avg_cost
      const marketValue = p.quantity * price
      const pnl = marketValue - cost
      return {
        ticker: p.ticker,
        quantity: p.quantity,
        avgCost: p.avg_cost,
        price,
        marketValue,
        pnl,
        pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
        weight: 0,
      }
    })
  const total = rows.reduce((sum, r) => sum + r.marketValue, 0)
  return rows.map((r) => ({ ...r, weight: total > 0 ? r.marketValue / total : 0 }))
}

export const formatPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`

export const formatSignedUsd = (n: number) => `${n > 0 ? '+' : ''}${formatUsd(n)}`

export const formatQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, ''))

const PNL_COLOR_CAP_PCT = 10

/** Green for profit, red for loss; opacity scales with magnitude up to ±10%. */
export function pnlColor(pnlPct: number): string {
  const strength = Math.min(Math.abs(pnlPct) / PNL_COLOR_CAP_PCT, 1)
  const alpha = (0.25 + 0.6 * strength).toFixed(2)
  if (pnlPct > 0) return `rgba(63, 185, 80, ${alpha})`
  if (pnlPct < 0) return `rgba(248, 81, 73, ${alpha})`
  return 'rgba(139, 148, 158, 0.25)'
}
