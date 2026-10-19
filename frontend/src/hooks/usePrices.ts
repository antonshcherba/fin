'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { priceStore, type PriceState } from '@/lib/priceStore'

const serverSnapshot: PriceState = { status: 'connecting', prices: {}, history: {}, open: {} }

export function usePrices(): PriceState {
  useEffect(() => {
    priceStore.start()
    return () => priceStore.stop()
  }, [])
  return useSyncExternalStore(priceStore.subscribe, priceStore.getSnapshot, () => serverSnapshot)
}
