'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { portfolioStore } from '@/lib/portfolioStore'
import type { Portfolio } from '@/lib/types'

export function usePortfolio(): Portfolio | null {
  useEffect(() => {
    portfolioStore.start()
    return () => portfolioStore.stop()
  }, [])
  return useSyncExternalStore(portfolioStore.subscribe, portfolioStore.getSnapshot, () => null)
}
