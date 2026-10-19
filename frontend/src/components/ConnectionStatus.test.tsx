import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConnectionStatus } from './ConnectionStatus'

describe('ConnectionStatus', () => {
  it.each([
    ['connected', 'bg-up'],
    ['reconnecting', 'bg-accent'],
    ['connecting', 'bg-accent'],
    ['disconnected', 'bg-down'],
  ] as const)('%s uses %s', (status, cls) => {
    render(<ConnectionStatus status={status} />)
    expect(screen.getByTestId('status-dot')).toHaveClass(cls)
    expect(screen.getByTestId('status-dot')).toHaveAttribute('data-status', status)
  })
})
