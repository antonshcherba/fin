const listeners = new Set<() => void>()

/** Lets components that own watchlist data refetch after the AI changes it. */
export const onWatchlistChanged = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const notifyWatchlistChanged = () => listeners.forEach((l) => l())
