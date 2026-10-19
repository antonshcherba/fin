import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { TradeBar } from './TradeBar'

const mocks = vi.hoisted(() => ({ trade: vi.fn(), refresh: vi.fn() }))

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { trade: mocks.trade },
}))
vi.mock('@/lib/portfolioStore', () => ({ portfolioStore: { refresh: mocks.refresh } }))

describe('TradeBar', () => {
  beforeEach(() => {
    mocks.trade.mockReset().mockResolvedValue({})
    mocks.refresh.mockReset().mockResolvedValue(undefined)
  })

  it('buys instantly with an uppercased ticker and refreshes the portfolio', async () => {
    const user = userEvent.setup()
    render(<TradeBar />)
    await user.type(screen.getByLabelText('Ticker'), 'aapl')
    await user.type(screen.getByLabelText('Quantity'), '5')
    await user.click(screen.getByRole('button', { name: 'Buy' }))

    expect(mocks.trade).toHaveBeenCalledWith({ ticker: 'AAPL', quantity: 5, side: 'buy' })
    expect(await screen.findByRole('status')).toHaveTextContent('Bought 5 AAPL')
    expect(mocks.refresh).toHaveBeenCalledWith({ afterTrade: true })
    expect(screen.getByLabelText('Quantity')).toHaveValue(null)
  })

  it('sells', async () => {
    const user = userEvent.setup()
    render(<TradeBar />)
    await user.type(screen.getByLabelText('Ticker'), 'MSFT')
    await user.type(screen.getByLabelText('Quantity'), '1.5')
    await user.click(screen.getByRole('button', { name: 'Sell' }))

    expect(mocks.trade).toHaveBeenCalledWith({ ticker: 'MSFT', quantity: 1.5, side: 'sell' })
    expect(await screen.findByRole('status')).toHaveTextContent('Sold 1.5 MSFT')
  })

  it('rejects empty ticker or non-positive quantity without calling the API', async () => {
    const user = userEvent.setup()
    render(<TradeBar />)
    await user.click(screen.getByRole('button', { name: 'Buy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('positive quantity')

    await user.type(screen.getByLabelText('Ticker'), 'AAPL')
    await user.type(screen.getByLabelText('Quantity'), '-2')
    await user.click(screen.getByRole('button', { name: 'Sell' }))
    expect(mocks.trade).not.toHaveBeenCalled()
  })

  it('shows the server error and keeps the quantity', async () => {
    mocks.trade.mockRejectedValue(new ApiError(400, 'Insufficient cash'))
    const user = userEvent.setup()
    render(<TradeBar />)
    await user.type(screen.getByLabelText('Ticker'), 'NVDA')
    await user.type(screen.getByLabelText('Quantity'), '1000')
    await user.click(screen.getByRole('button', { name: 'Buy' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient cash')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buy' })).toBeEnabled())
    expect(screen.getByLabelText('Quantity')).toHaveValue(1000)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
