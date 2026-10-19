import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PriceStore, parsePriceMessage } from './priceStore'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>)
  }
}

const makeStore = () => new PriceStore('/api/stream/prices', (u) => new FakeEventSource(u) as unknown as EventSource)
const last = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]

describe('parsePriceMessage', () => {
  it('parses a single tick and derives direction', () => {
    const [t] = parsePriceMessage('{"ticker":"aapl","price":191,"previous_price":190,"timestamp":1700000000}')
    expect(t).toMatchObject({ ticker: 'AAPL', price: 191, previousPrice: 190, direction: 'up', timestamp: 1700000000000 })
  })

  it('parses arrays and ticker-keyed maps', () => {
    expect(parsePriceMessage('[{"ticker":"A","price":1},{"ticker":"B","price":2}]')).toHaveLength(2)
    const ticks = parsePriceMessage('{"A":{"price":1,"direction":"down"},"B":{"price":2}}')
    expect(ticks.map((t) => t.ticker)).toEqual(['A', 'B'])
    expect(ticks[0].direction).toBe('down')
  })

  it('ignores malformed input', () => {
    expect(parsePriceMessage('not json')).toEqual([])
    expect(parsePriceMessage('{"ticker":"A"}')).toEqual([])
    expect(parsePriceMessage('null')).toEqual([])
  })
})

describe('PriceStore', () => {
  beforeEach(() => {
    FakeEventSource.instances = []
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('goes connecting -> connected and records prices and history', () => {
    const store = makeStore()
    store.start()
    expect(store.getSnapshot().status).toBe('connecting')
    last().onopen?.()
    expect(store.getSnapshot().status).toBe('connected')

    last().emit({ ticker: 'AAPL', price: 190, previous_price: 189 })
    last().emit({ ticker: 'AAPL', price: 191, previous_price: 190 })
    const snap = store.getSnapshot()
    expect(snap.prices.AAPL.price).toBe(191)
    expect(snap.history.AAPL).toEqual([190, 191])
  })

  it('keeps the first price seen as the open baseline', () => {
    const store = makeStore()
    store.start()
    last().emit({ ticker: 'AAPL', price: 190 })
    last().emit({ ticker: 'AAPL', price: 195 })
    expect(store.getSnapshot().open.AAPL).toBe(190)
  })

  it('notifies subscribers and returns a new snapshot per change', () => {
    const store = makeStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.start()
    const before = store.getSnapshot()
    last().emit({ ticker: 'X', price: 1 })
    expect(listener).toHaveBeenCalled()
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('shows reconnecting while the browser retries on its own', () => {
    const store = makeStore()
    store.start()
    last().onopen?.()
    last().readyState = 0
    last().onerror?.()
    expect(store.getSnapshot().status).toBe('reconnecting')
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('reports disconnected on a closed stream and reconnects with backoff', () => {
    const store = makeStore()
    store.start()
    last().readyState = 2
    last().onerror?.()
    expect(store.getSnapshot().status).toBe('disconnected')

    vi.advanceTimersByTime(1000)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(store.getSnapshot().status).toBe('reconnecting')
    last().onopen?.()
    expect(store.getSnapshot().status).toBe('connected')

    last().readyState = 2
    last().onerror?.()
    vi.advanceTimersByTime(999)
    expect(FakeEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(3)
  })

  it('stop closes the source and cancels retries', () => {
    const store = makeStore()
    store.start()
    const es = last()
    es.readyState = 2
    es.onerror?.()
    store.stop()
    vi.advanceTimersByTime(60000)
    expect(es.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('caps history length', () => {
    const store = makeStore()
    store.start()
    for (let i = 0; i < 350; i++) last().emit({ ticker: 'A', price: i })
    const h = store.getSnapshot().history.A
    expect(h).toHaveLength(300)
    expect(h[h.length - 1]).toBe(349)
  })
})
