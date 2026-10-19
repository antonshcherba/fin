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
