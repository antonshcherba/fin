import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, normalizeHistory } from './api'

const mockFetch = (res: Partial<Response> & { json?: () => Promise<unknown> }) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK', ...res }))

afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('GETs same-origin paths and parses JSON', async () => {
    mockFetch({ json: async () => ({ ok: 1 }) })
    expect(await api.get('/api/health')).toEqual({ ok: 1 })
    expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({ headers: expect.any(Object) }))
  })

  it('POSTs a JSON body', async () => {
    mockFetch({ json: async () => ({}) })
    await api.post('/api/watchlist', { ticker: 'PYPL' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/watchlist',
      expect.objectContaining({ method: 'POST', body: '{"ticker":"PYPL"}' }),
    )
  })

  it('throws ApiError with server detail on failure', async () => {
    mockFetch({ ok: false, status: 400, json: async () => ({ detail: 'Insufficient cash' }) })
    await expect(api.post('/api/portfolio/trade', {})).rejects.toMatchObject({
      status: 400,
      message: 'Insufficient cash',
    })
    await expect(api.post('/api/portfolio/trade', {})).rejects.toBeInstanceOf(ApiError)
  })

  it('handles 204 without a body', async () => {
    mockFetch({ status: 204 })
    expect(await api.del('/api/watchlist/AAPL')).toBeUndefined()
  })
})

describe('normalizeHistory', () => {
  const snap = { total_value: 10000, recorded_at: '2026-01-01T00:00:00Z' }

  it('accepts a bare array or a wrapped one', () => {
    expect(normalizeHistory([snap])).toEqual([snap])
    expect(normalizeHistory({ snapshots: [snap] })).toEqual([snap])
    expect(normalizeHistory({ history: [snap] })).toEqual([snap])
  })

  it('drops malformed entries and unknown shapes', () => {
    expect(normalizeHistory([snap, { total_value: 'x' }, null, { total_value: 1 }])).toEqual([snap])
    expect(normalizeHistory(null)).toEqual([])
    expect(normalizeHistory({})).toEqual([])
  })
})

describe('api.trade', () => {
  it('POSTs the trade to /api/portfolio/trade', async () => {
    mockFetch({ json: async () => ({}) })
    await api.trade({ ticker: 'AAPL', quantity: 2, side: 'buy' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/portfolio/trade',
      expect.objectContaining({ method: 'POST', body: '{"ticker":"AAPL","quantity":2,"side":"buy"}' }),
    )
  })
})
