import type { ConnectionStatus, Direction, PriceTick } from './types'

export const PRICE_STREAM_URL = '/api/stream/prices'
const MAX_HISTORY = 300
const MIN_RETRY_MS = 1000
const MAX_RETRY_MS = 15000

export interface PriceState {
  status: ConnectionStatus
  prices: Record<string, PriceTick>
  history: Record<string, number[]>
  /** First price seen per ticker since page load; baseline for the change %. */
  open: Record<string, number>
}

type EventSourceFactory = (url: string) => EventSource

function toNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function toTimestamp(v: unknown): number {
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    if (!Number.isNaN(parsed)) return parsed
  }
  const n = toNumber(v)
  if (n === null) return Date.now()
  return n < 1e12 ? n * 1000 : n
}

function parseTick(raw: unknown, fallbackTicker?: string): PriceTick | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const ticker = String(r.ticker ?? fallbackTicker ?? '').toUpperCase()
  const price = toNumber(r.price)
  if (!ticker || price === null) return null
  const previousPrice = toNumber(r.previous_price ?? r.previousPrice ?? r.prev_price) ?? price
  const explicit = r.direction ?? r.change_direction
  const direction: Direction =
    explicit === 'up' || explicit === 'down' || explicit === 'flat'
      ? explicit
      : price > previousPrice
        ? 'up'
        : price < previousPrice
          ? 'down'
          : 'flat'
  return { ticker, price, previousPrice, timestamp: toTimestamp(r.timestamp), direction }
}

/** Accepts one tick, an array of ticks, or a `{ TICKER: tick }` map. */
export function parsePriceMessage(data: string): PriceTick[] {
  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return []
  }
  if (Array.isArray(json)) return json.flatMap((t) => parseTick(t) ?? [])
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    if ('price' in obj) {
      const tick = parseTick(obj)
      return tick ? [tick] : []
    }
    return Object.entries(obj).flatMap(([ticker, t]) => parseTick(t, ticker) ?? [])
  }
  return []
}

export class PriceStore {
  private state: PriceState = { status: 'connecting', prices: {}, history: {}, open: {} }
  private listeners = new Set<() => void>()
  private source: EventSource | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = MIN_RETRY_MS
  private started = false

  constructor(
    private url: string = PRICE_STREAM_URL,
    private createSource: EventSourceFactory = (u) => new EventSource(u),
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = () => this.state

  start() {
    if (this.started) return
    this.started = true
    this.open()
  }

  stop() {
    this.started = false
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    this.source?.close()
    this.source = null
  }

  private setState(patch: Partial<PriceState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private open() {
    this.source?.close()
    const es = this.createSource(this.url)
    this.source = es

    es.onopen = () => {
      this.retryDelay = MIN_RETRY_MS
      this.setState({ status: 'connected' })
    }
    es.onmessage = (ev: MessageEvent<string>) => this.ingest(parsePriceMessage(ev.data))
    es.onerror = () => {
      if (es.readyState === 2 /* CLOSED */) {
        this.setState({ status: 'disconnected' })
        this.scheduleRetry()
      } else {
        this.setState({ status: 'reconnecting' })
      }
    }
  }

  private scheduleRetry() {
    if (!this.started || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (!this.started) return
      this.setState({ status: 'reconnecting' })
      this.open()
    }, this.retryDelay)
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS)
  }

  private ingest(ticks: PriceTick[]) {
    if (ticks.length === 0) return
    const prices = { ...this.state.prices }
    const history = { ...this.state.history }
    const open = { ...this.state.open }
    for (const t of ticks) {
      prices[t.ticker] = t
      open[t.ticker] ??= t.price
      history[t.ticker] = [...(history[t.ticker] ?? []), t.price].slice(-MAX_HISTORY)
    }
    this.setState({ prices, history, open })
  }
}

export const priceStore = new PriceStore()
