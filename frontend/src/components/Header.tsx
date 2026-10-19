'use client'

import { usePortfolio } from '@/hooks/usePortfolio'
import { usePrices } from '@/hooks/usePrices'
import { computeTotalValue, formatUsd } from '@/lib/portfolio'
import { ConnectionStatus } from './ConnectionStatus'

export function Header() {
  const { status, prices } = usePrices()
  const portfolio = usePortfolio()

  const total = portfolio ? computeTotalValue(portfolio, prices) : null
  const cash = portfolio?.cash_balance ?? null

  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
      <h1 className="text-base font-bold tracking-wide text-accent">
        Fin<span className="text-primary">Ally</span>
      </h1>
      <div className="flex items-center gap-6">
        <Stat label="Portfolio" value={total} testId="total-value" emphasized />
        <Stat label="Cash" value={cash} testId="cash-balance" />
        <ConnectionStatus status={status} />
      </div>
    </header>
  )
}

function Stat({
  label,
  value,
  testId,
  emphasized = false,
}: {
  label: string
  value: number | null
  testId: string
  emphasized?: boolean
}) {
  return (
    <div className="text-right leading-tight">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div data-testid={testId} className={emphasized ? 'text-base font-semibold text-fg' : 'text-fg'}>
        {value === null ? '—' : formatUsd(value)}
      </div>
    </div>
  )
}
