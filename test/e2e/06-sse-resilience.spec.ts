import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

const STREAM = '**/api/stream/prices'

test('price stream reconnects after the connection is lost', async ({ page }) => {
  await openApp(page)
  const dot = page.getByTestId('status-dot')

  // The page load and the stream's own reconnects both go through this route, so a failed stream
  // keeps failing until the route is removed.
  await page.route(STREAM, (route) => route.abort())
  await page.reload()
  await expect(dot).not.toHaveAttribute('data-status', 'connected')
  await expect(dot).toHaveAttribute('data-status', /reconnecting|disconnected/)

  await page.unroute(STREAM)
  await expect(dot).toHaveAttribute('data-status', 'connected', { timeout: 20_000 })

  const price = page.getByTestId('price-AAPL')
  await expect(price).toHaveText(/^\$[\d,]+\.\d{2}$/)
  const seen = await price.innerText()
  await expect.poll(() => price.innerText(), { timeout: 20_000 }).not.toBe(seen)
})
