'use client'

import { useEffect, useRef, useState } from 'react'
import type { PriceTick } from '@/lib/types'

export const FLASH_MS = 500

/** Returns 'up' / 'down' for FLASH_MS after a new tick moves the price, else null. */
export function useFlash(tick: PriceTick | undefined): 'up' | 'down' | null {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(tick)

  useEffect(() => {
    if (tick === prev.current) return
    prev.current = tick
    if (!tick || tick.direction === 'flat') return
    setFlash(tick.direction)
    const id = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(id)
  }, [tick])

  return flash
}
