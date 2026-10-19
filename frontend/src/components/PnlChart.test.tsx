import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PnlChart } from './PnlChart'

const state = vi.hoisted(() => ({ history: [] as unknown[] }))
vi.mock('@/hooks/usePortfolioHistory', () => ({ usePortfolioHistory: () => state.history }))

const snap = (total_value: number, i: number) => ({ total_value, recorded_at: `2026-01-01T00:0${i}:00Z` })

describe('PnlChart', () => {
  beforeEach(() => {
    state.history = []
  })

  it('shows a placeholder until there are two points', () => {
    state.history = [snap(10000, 0)]
    render(<PnlChart />)
    expect(screen.getByTestId('pnl-empty')).toBeInTheDocument()
  })

  it('draws a green line for a rising portfolio', () => {
    state.history = [snap(10000, 0), snap(10500, 1), snap(11000, 2)]
    render(<PnlChart />)
    const line = screen.getByTestId('pnl-line')
    expect(line.getAttribute('points')).toBe('0.00,40.00 50.00,20.00 100.00,0.00')
    expect(line.getAttribute('stroke')).toBe('var(--color-up)')
    expect(screen.getByText('$11,000.00')).toBeInTheDocument()
    expect(screen.getByText('$10,000.00')).toBeInTheDocument()
  })

  it('draws a red line for a falling portfolio and handles a flat series', () => {
    state.history = [snap(10000, 0), snap(9000, 1)]
    const { unmount } = render(<PnlChart />)
    expect(screen.getByTestId('pnl-line').getAttribute('stroke')).toBe('var(--color-down)')
    unmount()

    state.history = [snap(10000, 0), snap(10000, 1)]
    render(<PnlChart />)
    expect(screen.getByTestId('pnl-line').getAttribute('points')).not.toContain('NaN')
  })
})
