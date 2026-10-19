import { expect, test } from '@playwright/test'
import { parseUsd } from '../e2e/helpers'

test.describe('parseUsd', () => {
  test('parses plain and grouped amounts', () => {
    expect(parseUsd('$10,000.00')).toBe(10000)
    expect(parseUsd('$1,234,567.89')).toBe(1234567.89)
    expect(parseUsd(' $0.50 ')).toBe(0.5)
  })

  test('handles signs on either side of the dollar sign', () => {
    expect(parseUsd('+$2.00')).toBe(2)
    expect(parseUsd('-$1.50')).toBe(-1.5)
    expect(parseUsd('$-1.50')).toBe(-1.5)
  })

  test('rejects non-amounts', () => {
    expect(() => parseUsd('—')).toThrow(/not a USD amount/)
    expect(() => parseUsd('')).toThrow()
  })
})
