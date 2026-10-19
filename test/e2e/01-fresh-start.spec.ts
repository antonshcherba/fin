import { expect, test } from '@playwright/test'
import { DEFAULT_TICKERS, openApp, parseUsd } from './helpers'

test('fresh start shows the default watchlist, $10k cash and streaming prices', async ({ page }) => {
  await openApp(page)

  await expect(page.getByTestId('cash-balance')).toHaveText('$10,000.00')
  await expect(page.getByTestId('total-value')).toHaveText('$10,000.00')

  for (const ticker of DEFAULT_TICKERS) {
    await expect(page.getByTestId(`watch-${ticker}`)).toBeVisible()
    await expect(page.getByTestId(`price-${ticker}`)).toHaveText(/^\$[\d,]+\.\d{2}$/)
  }
  await expect(page.getByTestId('positions-empty')).toBeVisible()

  const readPrices = () => Promise.all(DEFAULT_TICKERS.map(async (t) => parseUsd(await page.getByTestId(`price-${t}`).innerText())))
  const initial = await readPrices()
  await expect.poll(async () => (await readPrices()).some((p, i) => p !== initial[i])).toBe(true)
})

test('the first watchlist ticker is selected in the main chart', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('chart-ticker')).toHaveText(DEFAULT_TICKERS[0])
  await page.getByRole('button', { name: 'Select NVDA' }).click()
  await expect(page.getByTestId('chart-ticker')).toHaveText('NVDA')
})
