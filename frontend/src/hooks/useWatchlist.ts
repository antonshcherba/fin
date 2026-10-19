'use client'

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { onWatchlistChanged } from '@/lib/watchlistEvents'

export interface WatchlistState {
  tickers: string[]
  loaded: boolean
  error: string | null
  add: (ticker: string) => Promise<boolean>
  remove: (ticker: string) => Promise<void>
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'Request failed')

export function useWatchlist(): WatchlistState {
  const [tickers, setTickers] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getWatchlist()
      .then((t) => !cancelled && setTickers(t))
      .catch((e) => !cancelled && setError(message(e)))
      .finally(() => !cancelled && setLoaded(true))
    const off = onWatchlistChanged(() => {
      api
        .getWatchlist()
        .then((t) => !cancelled && setTickers(t))
        .catch((e) => !cancelled && setError(message(e)))
    })
    return () => {
      cancelled = true
      off()
    }
  }, [])

  const add = useCallback(async (raw: string) => {
    const ticker = raw.trim().toUpperCase()
    if (!ticker) return false
    setError(null)
    try {
      await api.addToWatchlist(ticker)
      setTickers((prev) => (prev.includes(ticker) ? prev : [...prev, ticker]))
      return true
    } catch (e) {
      setError(message(e))
      return false
    }
  }, [])

  const remove = useCallback(async (ticker: string) => {
    setError(null)
    try {
      await api.removeFromWatchlist(ticker)
      setTickers((prev) => prev.filter((t) => t !== ticker))
    } catch (e) {
      setError(message(e))
    }
  }, [])

  return { tickers, loaded, error, add, remove }
}
