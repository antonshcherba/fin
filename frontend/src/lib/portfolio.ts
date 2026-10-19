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
