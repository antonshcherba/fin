'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api'
import { portfolioStore } from '@/lib/portfolioStore'
import type { TradeSide } from '@/lib/types'

interface Notice {
  kind: 'ok' | 'error'
  text: string
}

export function TradeBar() {
  const [ticker, setTicker] = useState('')
  const [quantity, setQuantity] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const submit = async (side: TradeSide) => {
    const symbol = ticker.trim().toUpperCase()
    const qty = Number(quantity)
    if (!symbol || !Number.isFinite(qty) || qty <= 0) {
      setNotice({ kind: 'error', text: 'Enter a ticker and a positive quantity' })
      return
    }
    setBusy(true)
    try {
      await api.trade({ ticker: symbol, quantity: qty, side })
      setNotice({ kind: 'ok', text: `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${symbol}` })
      setQuantity('')
      await portfolioStore.refresh({ afterTrade: true })
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Trade failed' })
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = (e: FormEvent) => e.preventDefault()
  const input =
    'min-w-0 flex-1 border border-border bg-bg px-2 py-1 text-fg placeholder:text-muted/60 focus:border-primary focus:outline-none'

  return (
    <form onSubmit={onSubmit} aria-label="Trade" className="mb-2">
      <div className="flex gap-1">
        <input
          aria-label="Ticker"
          placeholder="Ticker"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className={`${input} uppercase`}
        />
        <input
          aria-label="Quantity"
          placeholder="Qty"
          type="number"
          min="0"
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={input}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('buy')}
          className="bg-up/80 px-3 py-1 font-semibold text-bg hover:bg-up disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('sell')}
          className="bg-down/80 px-3 py-1 font-semibold text-bg hover:bg-down disabled:opacity-50"
        >
          Sell
        </button>
      </div>
      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-1 text-xs ${notice.kind === 'error' ? 'text-down' : 'text-up'}`}
        >
          {notice.text}
        </p>
      )}
    </form>
  )
}
