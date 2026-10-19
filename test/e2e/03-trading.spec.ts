import { expect, test } from '@playwright/test'
import { cash, openApp, trade } from './helpers'

test('buy then sell shares updates cash and the positions table', async ({ page }) => {
  await openApp(page)
  const start = await cash(page)

  await trade(page, 'Buy', 'AAPL', 10)
  const position = page.getByTestId('position-AAPL')
  await expect(position).toBeVisible()
  await expect(position.locator('td').nth(1)).toHaveText('10')
  await expect.poll(() => cash(page)).toBeLessThan(start)
  const afterBuy = await cash(page)
  await expect(page.getByTestId('positions-empty')).toHaveCount(0)

  await trade(page, 'Sell', 'AAPL', 4)
  await expect(position.locator('td').nth(1)).toHaveText('6')
  await expect.poll(() => cash(page)).toBeGreaterThan(afterBuy)

  await trade(page, 'Sell', 'AAPL', 6)
  await expect(page.getByTestId('position-AAPL')).toHaveCount(0)
  await expect(page.getByTestId('positions-empty')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('positions-empty')).toBeVisible()
})

test('rejects a buy larger than the cash balance and a sell of shares not owned', async ({ page }) => {
  await openApp(page)
  const before = await cash(page)

  await page.getByLabel('Ticker', { exact: true }).fill('AAPL')
  await page.getByLabel('Quantity').fill('1000000')
  await page.getByRole('button', { name: 'Buy', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /insufficient cash/i })).toBeVisible()

  await page.getByLabel('Quantity').fill('1')
  await page.getByRole('button', { name: 'Sell', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: /insufficient shares/i })).toBeVisible()

  expect(await cash(page)).toBe(before)
})
