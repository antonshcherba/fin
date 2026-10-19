import { describe, expect, it } from 'vitest'
import {
  computePositionRows,
  computeTotalValue,
  formatPct,
  formatQty,
  formatSignedUsd,
  formatUsd,
  pnlColor,
} from './portfolio'
import type { PriceTick } from './types'

const tick = (ticker: string, price: number): PriceTick => ({
  ticker,
  price,
  previousPrice: price,
  timestamp: 0,
  direction: 'flat',
})

describe('computeTotalValue', () => {
  const portfolio = {
    cash_balance: 1000,
    total_value: 0,
    positions: [
      { ticker: 'AAPL', quantity: 2, avg_cost: 100 },
      { ticker: 'MSFT', quantity: 1, avg_cost: 300 },
    ],
  }

  it('uses live prices', () => {
    expect(computeTotalValue(portfolio, { AAPL: tick('AAPL', 150), MSFT: tick('MSFT', 310) })).toBe(1610)
  })

  it('falls back to avg cost when no live price', () => {
    expect(computeTotalValue(portfolio, { AAPL: tick('AAPL', 150) })).toBe(1600)
  })

  it('is just cash with no positions', () => {
    expect(computeTotalValue({ cash_balance: 10000, total_value: 10000, positions: [] }, {})).toBe(10000)
  })
})

describe('formatUsd', () => {
  it('formats currency', () => expect(formatUsd(10000)).toBe('$10,000.00'))
})

describe('computePositionRows', () => {
  const portfolio = {
    cash_balance: 0,
    total_value: 0,
    positions: [
      { ticker: 'AAPL', quantity: 10, avg_cost: 100 },
      { ticker: 'MSFT', quantity: 1, avg_cost: 300 },
      { ticker: 'ZERO', quantity: 0, avg_cost: 50 },
    ],
  }

  it('computes P&L, percent change and weights from live prices', () => {
    const rows = computePositionRows(portfolio, { AAPL: tick('AAPL', 110), MSFT: tick('MSFT', 270) })
    expect(rows.map((r) => r.ticker)).toEqual(['AAPL', 'MSFT'])
    const [aapl, msft] = rows
    expect(aapl.marketValue).toBe(1100)
    expect(aapl.pnl).toBe(100)
    expect(aapl.pnlPct).toBeCloseTo(10)
    expect(msft.pnl).toBe(-30)
    expect(msft.pnlPct).toBeCloseTo(-10)
    expect(aapl.weight + msft.weight).toBeCloseTo(1)
    expect(aapl.weight).toBeCloseTo(1100 / 1370)
  })

  it('falls back to avg cost (zero P&L) when no live price', () => {
    const [aapl] = computePositionRows(portfolio, {})
    expect(aapl.price).toBe(100)
    expect(aapl.pnl).toBe(0)
  })
})

describe('formatting', () => {
  it('formats signed values', () => {
    expect(formatPct(1.234)).toBe('+1.23%')
    expect(formatPct(-2)).toBe('-2.00%')
    expect(formatPct(0)).toBe('0.00%')
    expect(formatSignedUsd(5)).toBe('+$5.00')
    expect(formatSignedUsd(-5)).toBe('-$5.00')
  })

  it('trims fractional quantities', () => {
    expect(formatQty(3)).toBe('3')
    expect(formatQty(1.5)).toBe('1.5')
    expect(formatQty(0.12345678)).toBe('0.1235')
  })
})

describe('pnlColor', () => {
  it('is green for gains, red for losses, gray when flat', () => {
    expect(pnlColor(5)).toContain('63, 185, 80')
    expect(pnlColor(-5)).toContain('248, 81, 73')
    expect(pnlColor(0)).toContain('139, 148, 158')
  })

  it('gets stronger with magnitude and saturates at 10%', () => {
    const alpha = (c: string) => Number(c.match(/([\d.]+)\)$/)![1])
    expect(alpha(pnlColor(8))).toBeGreaterThan(alpha(pnlColor(1)))
    expect(alpha(pnlColor(10))).toBe(alpha(pnlColor(50)))
  })
})
