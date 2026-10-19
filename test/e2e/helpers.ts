import { expect, type Page } from '@playwright/test'

export const DEFAULT_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'NFLX']

/** Parses "$1,234.56", "-$1.50" or "+$2.00" into a number. */
export function parseUsd(text: string): number {
  const match = text.trim().match(/^([+-])?\$?([+-])?([\d,]+(?:\.\d+)?)$/)
  if (!match) throw new Error(`not a USD amount: ${JSON.stringify(text)}`)
  const negative = match[1] === '-' || match[2] === '-'
  const value = Number(match[3].replace(/,/g, ''))
  return negative ? -value : value
}

export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('status-dot')).toHaveAttribute('data-status', 'connected')
}

export async function cash(page: Page): Promise<number> {
  return parseUsd(await page.getByTestId('cash-balance').innerText())
}

export async function trade(page: Page, side: 'Buy' | 'Sell', ticker: string, quantity: number) {
  await page.getByLabel('Ticker', { exact: true }).fill(ticker)
  await page.getByLabel('Quantity').fill(String(quantity))
  await page.getByRole('button', { name: side, exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: `${side === 'Buy' ? 'Bought' : 'Sold'} ${quantity} ${ticker}` })).toBeVisible()
}
