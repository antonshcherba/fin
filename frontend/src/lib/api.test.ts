import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from './api'

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
