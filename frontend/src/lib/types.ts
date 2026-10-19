export type Direction = 'up' | 'down' | 'flat'

export interface PriceTick {
  ticker: string
  price: number
  previousPrice: number
  timestamp: number
  direction: Direction
}

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface Position {
  ticker: string
  quantity: number
  avg_cost: number
}

export interface Portfolio {
  cash_balance: number
  total_value: number
  positions: Position[]
}

export type TradeSide = 'buy' | 'sell'

export interface TradeRequest {
  ticker: string
  quantity: number
  side: TradeSide
}

export interface PortfolioSnapshot {
  total_value: number
  recorded_at: string
}

export interface ChatTrade {
  ticker: string
  side: TradeSide
  quantity: number
  price?: number
  error?: string | null
}

export interface ChatWatchlistChange {
  ticker: string
  action: 'add' | 'remove'
  error?: string | null
}

export interface ChatResponse {
  message: string
  trades?: ChatTrade[]
  watchlist_changes?: ChatWatchlistChange[]
}
