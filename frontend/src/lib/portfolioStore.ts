import { api } from './api'
import type { Portfolio } from './types'

const REFRESH_MS = 5000

/** Shared portfolio state: one poll loop no matter how many components subscribe. */
export class PortfolioStore {
  private portfolio: Portfolio | null = null
  private listeners = new Set<() => void>()
  private tradeListeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private subscribers = 0

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.portfolio

  /** Notified after a successful `refresh({ afterTrade: true })`. */
  onTrade = (listener: () => void) => {
    this.tradeListeners.add(listener)
    return () => {
      this.tradeListeners.delete(listener)
    }
  }

  start() {
    this.subscribers++
    if (this.subscribers > 1) return
    void this.refresh()
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS)
  }

  stop() {
    this.subscribers = Math.max(0, this.subscribers - 1)
    if (this.subscribers > 0) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async refresh({ afterTrade = false } = {}) {
    try {
      this.portfolio = await api.getPortfolio()
    } catch {
      return
    }
    this.listeners.forEach((l) => l())
    if (afterTrade) this.tradeListeners.forEach((l) => l())
  }
}

export const portfolioStore = new PortfolioStore()
