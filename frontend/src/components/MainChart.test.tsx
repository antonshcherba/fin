import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectionStore } from '@/lib/selectionStore'
import type { PriceState } from '@/lib/priceStore'
import { MainChart } from './MainChart'

const state = vi.hoisted(() => ({ current: null as unknown as PriceState }))
vi.mock('@/hooks/usePrices', () => ({ usePrices: () => state.current }))

const tick = (ticker: string, price: number) => ({
  ticker,
  price,
  previousPrice: price,
  timestamp: 0,
  direction: 'flat' as const,
})

describe('MainChart', () => {
  beforeEach(() => {
    state.current = {
      status: 'connected',
      prices: { AAPL: tick('AAPL', 120), MSFT: tick('MSFT', 80) },
      history: { AAPL: [100, 110, 120], MSFT: [100, 90, 80] },
      open: { AAPL: 100, MSFT: 100 },
    }
    act(() => selectionStore.select(null))
  })

  it('prompts for a selection when none is made', () => {
    render(<MainChart />)
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument()
  })

  it('draws the selected ticker and follows selection changes', () => {
    act(() => selectionStore.select('AAPL'))
    render(<MainChart />)
    expect(screen.getByTestId('chart-ticker')).toHaveTextContent('AAPL')
    expect(screen.getByTestId('chart-price')).toHaveTextContent('$120.00')
    expect(screen.getByText('+20.00%')).toBeInTheDocument()
    expect(screen.getByTestId('chart-line').getAttribute('points')).toBe('0.00,40.00 50.00,20.00 100.00,0.00')
    expect(screen.getByTestId('chart-line').getAttribute('stroke')).toBe('var(--color-up)')

    act(() => selectionStore.select('MSFT'))
    expect(screen.getByTestId('chart-ticker')).toHaveTextContent('MSFT')
    expect(screen.getByTestId('chart-line').getAttribute('stroke')).toBe('var(--color-down)')
  })

  it('waits for two points and tolerates a flat series', () => {
    state.current = { ...state.current, history: { AAPL: [100], MSFT: [5, 5] } }
    act(() => selectionStore.select('AAPL'))
    render(<MainChart />)
    expect(screen.getByTestId('chart-collecting')).toBeInTheDocument()

    act(() => selectionStore.select('MSFT'))
    expect(screen.getByTestId('chart-line').getAttribute('points')).not.toContain('NaN')
  })
})
