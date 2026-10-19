import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Header } from './Header'

const state = vi.hoisted(() => ({
  prices: {} as Record<string, unknown>,
  portfolio: null as unknown,
  status: 'connected',
}))

vi.mock('@/hooks/usePrices', () => ({
  usePrices: () => ({ status: state.status, prices: state.prices, history: {} }),
}))
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => state.portfolio }))

describe('Header', () => {
  beforeEach(() => {
    state.prices = {}
    state.portfolio = null
    state.status = 'connected'
  })

  it('shows placeholders before the portfolio loads', () => {
    render(<Header />)
    expect(screen.getByTestId('total-value')).toHaveTextContent('—')
    expect(screen.getByTestId('cash-balance')).toHaveTextContent('—')
  })

  it('shows live total value and cash', () => {
    state.portfolio = {
      cash_balance: 5000,
      total_value: 0,
      positions: [{ ticker: 'AAPL', quantity: 10, avg_cost: 100 }],
    }
    state.prices = { AAPL: { ticker: 'AAPL', price: 200 } }
    render(<Header />)
    expect(screen.getByTestId('total-value')).toHaveTextContent('$7,000.00')
    expect(screen.getByTestId('cash-balance')).toHaveTextContent('$5,000.00')
  })

  it('reflects connection status', () => {
    state.status = 'disconnected'
    render(<Header />)
    expect(screen.getByTestId('status-dot')).toHaveAttribute('data-status', 'disconnected')
  })
})
