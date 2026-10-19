'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useFlash } from '@/hooks/useFlash'
import { usePrices } from '@/hooks/usePrices'
import { useSelectedTicker } from '@/hooks/useSelectedTicker'
import { useWatchlist } from '@/hooks/useWatchlist'
import { formatPct, formatUsd } from '@/lib/portfolio'
import type { PriceTick } from '@/lib/types'
import { Sparkline } from './Sparkline'

interface RowProps {
  ticker: string
  tick: PriceTick | undefined
  open: number | undefined
  history: number[]
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}

function WatchlistRow({ ticker, tick, open, history, selected, onSelect, onRemove }: RowProps) {
  const flash = useFlash(tick)
  const change = tick && open ? ((tick.price - open) / open) * 100 : null
  const tone = change === null || change === 0 ? 'text-fg' : change > 0 ? 'text-up' : 'text-down'

  return (
    <li
      data-testid={`watch-${ticker}`}
      aria-current={selected ? 'true' : undefined}
      className={`flex items-center gap-2 border-t border-border/50 px-1 py-1 ${selected ? 'bg-surface-2' : ''}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Select ${ticker}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="w-12 font-semibold text-accent">{ticker}</span>
        <span
          data-testid={`price-${ticker}`}
          className={`flash-fade w-20 px-1 text-right ${flash ? `flash-${flash}` : ''}`}
        >
          {tick ? formatUsd(tick.price) : '—'}
        </span>
        <span data-testid={`change-${ticker}`} className={`w-16 text-right ${tone}`}>
          {change === null ? '—' : formatPct(change)}
        </span>
        <span className="min-w-8 flex-1">
          <Sparkline values={history} />
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${ticker}`}
        className="px-1 text-muted hover:text-down"
      >
        ×
      </button>
    </li>
  )
}

export function Watchlist() {
  const { tickers, loaded, error, add, remove } = useWatchlist()
  const { prices, history, open } = usePrices()
  const [selected, select] = useSelectedTicker()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (tickers.length > 0 && (!selected || !tickers.includes(selected))) select(tickers[0])
  }, [tickers, selected, select])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await add(draft)) setDraft('')
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <form onSubmit={submit} className="flex gap-1">
        <input
          aria-label="Add ticker"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add ticker"
          maxLength={10}
          className="min-w-0 flex-1 border border-border bg-bg px-2 py-1 uppercase"
        />
        <button type="submit" className="border border-border px-2 py-1 text-primary hover:bg-surface-2">
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="text-down">
          {error}
        </p>
      )}
      {loaded && tickers.length === 0 ? (
        <p data-testid="watchlist-empty" className="py-3 text-center text-muted/60">
          No tickers watched
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {tickers.map((t) => (
            <WatchlistRow
              key={t}
              ticker={t}
              tick={prices[t]}
              open={open[t]}
              history={history[t] ?? []}
              selected={t === selected}
              onSelect={() => select(t)}
              onRemove={() => remove(t)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
