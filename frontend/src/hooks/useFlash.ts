'use client'

import { useEffect, useState } from 'react'
import type { PriceTick } from '@/lib/types'

export const FLASH_MS = 500

/** Returns 'up' / 'down' for FLASH_MS after a new tick moves the price, else null. */
export function useFlash(tick: PriceTick | undefined): 'up' | 'down' | null {
  const [initial] = useState(tick)
  const [dismissed, setDismissed] = useState<PriceTick>()
  const direction = tick && tick !== initial && tick !== dismissed ? tick.direction : 'flat'

  useEffect(() => {
    if (direction === 'flat') return
    const id = setTimeout(() => setDismissed(tick), FLASH_MS)
    return () => clearTimeout(id)
  }, [tick, direction])

  return direction === 'flat' ? null : direction
}
