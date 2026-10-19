import { describe, expect, it } from 'vitest'
import { computeTotalValue, formatUsd } from './portfolio'
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
