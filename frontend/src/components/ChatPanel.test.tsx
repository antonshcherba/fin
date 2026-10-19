import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { onWatchlistChanged } from '@/lib/watchlistEvents'
import { ChatPanel } from './ChatPanel'

const mocks = vi.hoisted(() => ({ chat: vi.fn(), refresh: vi.fn() }))

vi.mock('@/lib/api', async (orig) => ({
  ...(await orig<typeof import('@/lib/api')>()),
  api: { chat: mocks.chat },
}))
vi.mock('@/lib/portfolioStore', () => ({ portfolioStore: { refresh: mocks.refresh } }))

describe('ChatPanel', () => {
  beforeEach(() => {
    mocks.chat.mockReset()
    mocks.refresh.mockReset().mockResolvedValue(undefined)
  })

  it('renders the user message and the assistant reply', async () => {
    mocks.chat.mockResolvedValue({ message: 'You hold 10 AAPL.' })
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.type(screen.getByLabelText('Message'), 'What do I own?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(mocks.chat).toHaveBeenCalledWith('What do I own?')
    expect(await screen.findByText('You hold 10 AAPL.')).toBeInTheDocument()
    expect(screen.getByText('What do I own?')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('shows a loading indicator while waiting and disables input', async () => {
    let resolve!: (v: unknown) => void
    mocks.chat.mockReturnValue(new Promise((r) => (resolve = r)))
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.type(screen.getByLabelText('Message'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toBeDisabled()

    resolve({ message: 'hello' })
    expect(await screen.findByText('hello')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('shows trade and watchlist confirmations inline and refreshes', async () => {
    mocks.chat.mockResolvedValue({
      message: 'Done.',
      trades: [
        { ticker: 'AAPL', side: 'buy', quantity: 5, price: 190.5 },
        { ticker: 'TSLA', side: 'buy', quantity: 999, error: 'Insufficient cash' },
      ],
      watchlist_changes: [{ ticker: 'PYPL', action: 'add' }],
    })
    const changed = vi.fn()
    const off = onWatchlistChanged(changed)
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.type(screen.getByLabelText('Message'), 'buy some')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    const list = await screen.findByRole('list', { name: 'Executed actions' })
    expect(list).toHaveTextContent('Bought 5 AAPL @ $190.50')
    expect(list).toHaveTextContent('Failed to buy 999 TSLA: Insufficient cash')
    expect(list).toHaveTextContent('Added PYPL to watchlist')
    expect(mocks.refresh).toHaveBeenCalledWith({ afterTrade: true })
    expect(changed).toHaveBeenCalledTimes(1)
    off()
  })

  it('shows an error when the request fails', async () => {
    mocks.chat.mockRejectedValue(new ApiError(500, 'LLM unavailable'))
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.type(screen.getByLabelText('Message'), 'hi')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('LLM unavailable')
    await waitFor(() => expect(screen.getByLabelText('Message')).toBeEnabled())
  })

  it('ignores blank messages', async () => {
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.type(screen.getByLabelText('Message'), '   ')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(mocks.chat).not.toHaveBeenCalled()
  })

  it('collapses and expands', async () => {
    const user = userEvent.setup()
    render(<ChatPanel />)
    await user.click(screen.getByRole('button', { name: 'Collapse chat' }))
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand chat' }))
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
  })
})
