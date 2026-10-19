'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { portfolioStore } from '@/lib/portfolioStore'
import type { PortfolioSnapshot } from '@/lib/types'

const REFRESH_MS = 30000

export function usePortfolioHistory(): PortfolioSnapshot[] {
  const [history, setHistory] = useState<PortfolioSnapshot[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .getPortfolioHistory()
        .then((h) => !cancelled && setHistory(h))
        .catch(() => {})
    load()
    const id = setInterval(load, REFRESH_MS)
    const offTrade = portfolioStore.onTrade(load)
    return () => {
      cancelled = true
      clearInterval(id)
      offTrade()
    }
  }, [])

  return history
}
