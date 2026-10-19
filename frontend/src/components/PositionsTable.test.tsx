import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PositionsTable } from './PositionsTable'

const state = vi.hoisted(() => ({
  prices: {} as Record<string, unknown>,
  portfolio: null as unknown,
}))

vi.mock('@/hooks/usePrices', () => ({ usePrices: () => ({ status: 'connected', prices: state.prices, history: {} }) }))
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => state.portfolio }))

describe('PositionsTable', () => {
  beforeEach(() => {
    state.prices = {}
    state.portfolio = null
  })

  it('shows an empty state with no positions', () => {
    state.portfolio = { cash_balance: 10000, total_value: 10000, positions: [] }
    render(<PositionsTable />)
    expect(screen.getByTestId('positions-empty')).toHaveTextContent('No positions yet')
  })

  it('renders ticker, qty, avg cost, price, P&L and % change', () => {
    state.portfolio = {
      cash_balance: 0,
      total_value: 0,
      positions: [
        { ticker: 'AAPL', quantity: 10, avg_cost: 100 },
        { ticker: 'TSLA', quantity: 1.5, avg_cost: 200 },
      ],
    }
    state.prices = { AAPL: { price: 110 }, TSLA: { price: 180 } }
    render(<PositionsTable />)

    const aapl = within(screen.getByTestId('position-AAPL')).getAllByRole('cell')
    expect(aapl.map((c) => c.textContent)).toEqual(['AAPL', '10', '$100.00', '$110.00', '+$100.00', '+10.00%'])
    expect(aapl[4]).toHaveClass('text-up')

    const tsla = within(screen.getByTestId('position-TSLA')).getAllByRole('cell')
    expect(tsla.map((c) => c.textContent)).toEqual(['TSLA', '1.5', '$200.00', '$180.00', '-$30.00', '-10.00%'])
    expect(tsla[4]).toHaveClass('text-down')
  })
})
