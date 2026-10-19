'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { Portfolio } from '@/lib/types'

const REFRESH_MS = 5000

export function usePortfolio(): Portfolio | null {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .getPortfolio()
        .then((p) => !cancelled && setPortfolio(p))
        .catch(() => {})
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return portfolio
}
