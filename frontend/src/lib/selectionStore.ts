/** Which ticker the main chart shows; shared between the watchlist and the chart. */
export class SelectionStore {
  private selected: string | null = null
  private listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.selected

  select = (ticker: string | null) => {
    if (ticker === this.selected) return
    this.selected = ticker
    this.listeners.forEach((l) => l())
  }
}

export const selectionStore = new SelectionStore()
