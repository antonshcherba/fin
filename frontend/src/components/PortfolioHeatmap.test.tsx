import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortfolioHeatmap } from './PortfolioHeatmap'

const state = vi.hoisted(() => ({
  prices: {} as Record<string, unknown>,
  portfolio: null as unknown,
}))

vi.mock('@/hooks/usePrices', () => ({ usePrices: () => ({ status: 'connected', prices: state.prices, history: {} }) }))
vi.mock('@/hooks/usePortfolio', () => ({ usePortfolio: () => state.portfolio }))

describe('PortfolioHeatmap', () => {
  beforeEach(() => {
    state.prices = {}
    state.portfolio = null
  })

  it('shows a loading state before the portfolio arrives', () => {
    render(<PortfolioHeatmap />)
    expect(screen.getByTestId('heatmap-empty')).toHaveTextContent('Loading')
  })

  it('shows an empty state with no positions', () => {
    state.portfolio = { cash_balance: 10000, total_value: 10000, positions: [] }
    render(<PortfolioHeatmap />)
    expect(screen.getByTestId('heatmap-empty')).toHaveTextContent('No positions yet')
  })

  it('renders a tile per position, sized by weight and colored by P&L', () => {
    state.portfolio = {
      cash_balance: 0,
      total_value: 0,
      positions: [
        { ticker: 'AAPL', quantity: 10, avg_cost: 100 },
        { ticker: 'TSLA', quantity: 1, avg_cost: 300 },
      ],
    }
    state.prices = { AAPL: { price: 110 }, TSLA: { price: 270 } }
    render(<PortfolioHeatmap />)

    const aapl = screen.getByTestId('heatmap-tile-AAPL')
    const tsla = screen.getByTestId('heatmap-tile-TSLA')
    expect(aapl).toHaveTextContent('+10.00%')
    expect(tsla).toHaveTextContent('-10.00%')
    expect(aapl.style.backgroundColor).toContain('63, 185, 80')
    expect(tsla.style.backgroundColor).toContain('248, 81, 73')

    const areaPct = (el: HTMLElement) => parseFloat(el.style.width) * parseFloat(el.style.height)
    expect(areaPct(aapl)).toBeGreaterThan(areaPct(tsla))
    expect(areaPct(aapl) + areaPct(tsla)).toBeCloseTo(10000, 0)
  })
})
