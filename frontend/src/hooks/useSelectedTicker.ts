'use client'

import { useSyncExternalStore } from 'react'
import { selectionStore } from '@/lib/selectionStore'

export function useSelectedTicker(): [string | null, (ticker: string | null) => void] {
  const selected = useSyncExternalStore(selectionStore.subscribe, selectionStore.getSnapshot, () => null)
  return [selected, selectionStore.select]
}
