import type { ChatResponse, Portfolio, PortfolioSnapshot, TradeRequest } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? body.error ?? detail
    } catch {}
    throw new ApiError(res.status, typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

/** Accepts a bare array or an object wrapping one under `snapshots` / `history`. */
export function normalizeHistory(raw: unknown): PortfolioSnapshot[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).snapshots ?? (raw as Record<string, unknown>).history)
      : null
  if (!Array.isArray(list)) return []
  return list.flatMap((s) => {
    const value = Number(s?.total_value)
    return Number.isFinite(value) && typeof s?.recorded_at === 'string'
      ? [{ total_value: value, recorded_at: s.recorded_at as string }]
      : []
  })
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  getPortfolio: () => request<Portfolio>('/api/portfolio'),
  getPortfolioHistory: async () => normalizeHistory(await request<unknown>('/api/portfolio/history')),
  chat: (message: string) => request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  }),
  trade: (req: TradeRequest) => request<unknown>('/api/portfolio/trade', {
    method: 'POST',
    body: JSON.stringify(req),
  }),
}
