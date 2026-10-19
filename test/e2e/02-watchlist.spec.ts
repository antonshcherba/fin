import { expect, test } from '@playwright/test'
import { DEFAULT_TICKERS, openApp } from './helpers'

test('add and remove a ticker from the watchlist', async ({ page }) => {
  await openApp(page)

  await page.getByLabel('Add ticker').fill('PYPL')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByTestId('watch-PYPL')).toBeVisible()
  await expect(page.getByTestId('price-PYPL')).toHaveText(/^\$[\d,]+\.\d{2}$/)

  await page.reload()
  await expect(page.getByTestId('watch-PYPL')).toBeVisible()

  await page.getByRole('button', { name: 'Remove PYPL' }).click()
  await expect(page.getByTestId('watch-PYPL')).toHaveCount(0)
  await expect(page.getByTestId(/^watch-/)).toHaveCount(DEFAULT_TICKERS.length)

  await page.reload()
  await expect(page.getByTestId('watch-AAPL')).toBeVisible()
  await expect(page.getByTestId('watch-PYPL')).toHaveCount(0)
})
