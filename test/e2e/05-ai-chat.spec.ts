import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

async function say(page: import('@playwright/test').Page, text: string) {
  await page.getByLabel('Message').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

test('mocked AI chat answers a question with a portfolio summary', async ({ page }) => {
  await openApp(page)
  await say(page, 'How is my portfolio doing?')
  const log = page.getByRole('log', { name: 'Chat history' })
  await expect(log).toContainText('How is my portfolio doing?')
  await expect(log).toContainText(/Mock mode: your portfolio is worth \$[\d,]+\.\d{2}/)
  await expect(page.getByRole('status', { name: 'Loading' })).toHaveCount(0)
})

test('AI-executed trade and watchlist change appear inline and are applied', async ({ page, request }) => {
  await openApp(page)
  await say(page, 'buy 3 NVDA')

  const actions = page.getByRole('list', { name: 'Executed actions' }).last()
  await expect(actions).toContainText(/Bought 3 NVDA @ \$[\d,]+\.\d{2}/)
  await expect(page.getByTestId('position-NVDA')).toBeVisible()

  await say(page, 'add PYPL to watchlist')
  await expect(page.getByRole('list', { name: 'Executed actions' }).last()).toContainText('Added PYPL to watchlist')
  await expect.poll(async () => (await (await request.get('/api/watchlist')).json()).map((e: { ticker: string }) => e.ticker)).toContain('PYPL')

  await say(page, 'sell 100 NVDA')
  await expect(page.getByRole('list', { name: 'Executed actions' }).last()).toContainText(/Failed to sell 100 NVDA/)
  await expect(page.getByTestId('position-NVDA')).toBeVisible()
})

test('AI watchlist change shows up in the watchlist panel without a reload', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('watch-PYPL')).toHaveCount(0)
  await say(page, 'add PYPL to watchlist')
  await expect(page.getByTestId('watch-PYPL')).toBeVisible()
  await say(page, 'remove PYPL from watchlist')
  await expect(page.getByTestId('watch-PYPL')).toHaveCount(0)
})
