import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectionStore } from '@/lib/selectionStore'
import { notifyWatchlistChanged } from '@/lib/watchlistEvents'
import type { PriceState } from '@/lib/priceStore'
import type { PriceTick } from '@/lib/types'
import { Watchlist } from './Watchlist'

const mocks = vi.hoisted(() => ({
  getWatchlist: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  prices: { current: null as unknown as PriceState },
}))

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { getWatchlist: mocks.getWatchlist, addToWatchlist: mocks.add, removeFromWatchlist: mocks.remove },
}))
vi.mock('@/hooks/usePrices', () => ({ usePrices: () => mocks.prices.current }))

const tick = (ticker: string, price: number, previousPrice = price): PriceTick => ({
  ticker,
  price,
  previousPrice,
  timestamp: Date.now(),
  direction: price > previousPrice ? 'up' : price < previousPrice ? 'down' : 'flat',
})

const state = (ticks: PriceTick[], history: Record<string, number[]> = {}, open: Record<string, number> = {}): PriceState => ({
  status: 'connected',
  prices: Object.fromEntries(ticks.map((t) => [t.ticker, t])),
  history,
  open,
})

describe('Watchlist', () => {
  beforeEach(() => {
    mocks.getWatchlist.mockReset().mockResolvedValue(['AAPL', 'MSFT'])
    mocks.add.mockReset().mockResolvedValue({})
    mocks.remove.mockReset().mockResolvedValue({})
    mocks.prices.current = state([tick('AAPL', 110), tick('MSFT', 90)], { AAPL: [100, 110], MSFT: [100, 90] }, { AAPL: 100, MSFT: 100 })
    selectionStore.select(null)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders rows with price, change % and sparkline, and selects the first ticker', async () => {
    render(<Watchlist />)
    expect(await screen.findByTestId('watch-AAPL')).toBeInTheDocument()
    expect(screen.getByTestId('price-AAPL')).toHaveTextContent('$110.00')
    expect(screen.getByTestId('change-AAPL')).toHaveTextContent('+10.00%')
    expect(screen.getByTestId('change-AAPL')).toHaveClass('text-up')
    expect(screen.getByTestId('change-MSFT')).toHaveTextContent('-10.00%')
    expect(screen.getByTestId('change-MSFT')).toHaveClass('text-down')
    expect(within(screen.getByTestId('watch-AAPL')).getByTestId('sparkline')).toBeInTheDocument()
    await waitFor(() => expect(selectionStore.getSnapshot()).toBe('AAPL'))
  })

  it('shows placeholders before any price arrives', async () => {
    mocks.prices.current = state([])
    render(<Watchlist />)
    expect(await screen.findByTestId('price-AAPL')).toHaveTextContent('—')
    expect(screen.getByTestId('change-AAPL')).toHaveTextContent('—')
    expect(within(screen.getByTestId('watch-AAPL')).getByTestId('sparkline-empty')).toBeInTheDocument()
  })

  it('selects a ticker on click', async () => {
    const user = userEvent.setup()
    render(<Watchlist />)
    await user.click(await screen.findByRole('button', { name: 'Select MSFT' }))
    expect(selectionStore.getSnapshot()).toBe('MSFT')
    expect(screen.getByTestId('watch-MSFT')).toHaveAttribute('aria-current', 'true')
  })

  it('flashes green on an uptick and red on a downtick, then clears after 500ms', async () => {
    const { rerender } = render(<Watchlist />)
    await screen.findByTestId('watch-AAPL')
    vi.useFakeTimers()

    mocks.prices.current = state([tick('AAPL', 111, 110), tick('MSFT', 89, 90)])
    rerender(<Watchlist />)
    expect(screen.getByTestId('price-AAPL')).toHaveClass('flash-up')
    expect(screen.getByTestId('price-MSFT')).toHaveClass('flash-down')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(screen.getByTestId('price-AAPL')).not.toHaveClass('flash-up')
    expect(screen.getByTestId('price-MSFT')).not.toHaveClass('flash-down')
  })

  it('does not flash on initial render or when the price is unchanged', async () => {
    const { rerender } = render(<Watchlist />)
    await screen.findByTestId('watch-AAPL')
    expect(screen.getByTestId('price-AAPL')).not.toHaveClass('flash-up')

    mocks.prices.current = state([tick('AAPL', 110, 110), tick('MSFT', 90, 90)])
    rerender(<Watchlist />)
    expect(screen.getByTestId('price-AAPL')).not.toHaveClass('flash-up')
    expect(screen.getByTestId('price-AAPL')).not.toHaveClass('flash-down')
  })

  it('adds an uppercased ticker via the API and clears the input', async () => {
    const user = userEvent.setup()
    render(<Watchlist />)
    await screen.findByTestId('watch-AAPL')
    await user.type(screen.getByLabelText('Add ticker'), 'nvda')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(mocks.add).toHaveBeenCalledWith('NVDA')
    expect(await screen.findByTestId('watch-NVDA')).toBeInTheDocument()
    expect(screen.getByLabelText('Add ticker')).toHaveValue('')
  })

  it('shows the error and keeps the input when adding fails', async () => {
    mocks.add.mockRejectedValue(new Error('Unknown ticker'))
    const user = userEvent.setup()
    render(<Watchlist />)
    await screen.findByTestId('watch-AAPL')
    await user.type(screen.getByLabelText('Add ticker'), 'zzzz')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown ticker')
    expect(screen.getByLabelText('Add ticker')).toHaveValue('zzzz')
    expect(screen.queryByTestId('watch-ZZZZ')).not.toBeInTheDocument()
  })

  it('removes a ticker and moves selection off it', async () => {
    const user = userEvent.setup()
    render(<Watchlist />)
    await screen.findByTestId('watch-AAPL')
    await waitFor(() => expect(selectionStore.getSnapshot()).toBe('AAPL'))
    await user.click(screen.getByRole('button', { name: 'Remove AAPL' }))

    expect(mocks.remove).toHaveBeenCalledWith('AAPL')
    await waitFor(() => expect(screen.queryByTestId('watch-AAPL')).not.toBeInTheDocument())
    await waitFor(() => expect(selectionStore.getSnapshot()).toBe('MSFT'))
  })

  it('keeps the ticker when removal fails', async () => {
    mocks.remove.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    render(<Watchlist />)
    await user.click(await screen.findByRole('button', { name: 'Remove AAPL' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByTestId('watch-AAPL')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    mocks.getWatchlist.mockResolvedValue([])
    render(<Watchlist />)
    expect(await screen.findByTestId('watchlist-empty')).toBeInTheDocument()
  })

  it('refetches when the AI changes the watchlist', async () => {
    render(<Watchlist />)
    expect(await screen.findByTestId('watch-AAPL')).toBeInTheDocument()
    mocks.getWatchlist.mockResolvedValue(['AAPL', 'MSFT', 'PYPL'])
    act(() => notifyWatchlistChanged())
    expect(await screen.findByTestId('watch-PYPL')).toBeInTheDocument()
  })
})
