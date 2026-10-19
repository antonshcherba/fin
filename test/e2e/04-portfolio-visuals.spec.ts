import { expect, test } from '@playwright/test'
import { openApp, trade } from './helpers'

test('heatmap tiles and the P&L chart render after trading', async ({ page }) => {
  await openApp(page)
  await expect(page.getByTestId('heatmap-empty')).toBeVisible()

  await trade(page, 'Buy', 'TSLA', 5)
  await trade(page, 'Buy', 'JPM', 5)

  await expect(page.getByTestId('heatmap')).toBeVisible()
  for (const ticker of ['TSLA', 'JPM']) {
    const tile = page.getByTestId(`heatmap-tile-${ticker}`)
    await expect(tile).toBeVisible()
    const pct = (await tile.innerText()).match(/([+-]?\d+\.\d{2})%/)
    expect(pct, `P&L percent in ${ticker} tile`).not.toBeNull()
    const color = await tile.evaluate((el) => getComputedStyle(el).backgroundColor)
    const value = Number(pct![1])
    const expected = value > 0 ? /^rgba\(63, 185, 80/ : value < 0 ? /^rgba\(248, 81, 73/ : /^rgba\(139, 148, 158/
    expect(color).toMatch(expected)
  }

  // every trade records a portfolio snapshot, so two trades give the chart its minimum of two points
  await expect(page.getByTestId('pnl-chart')).toBeVisible()
  const points = await page.getByTestId('pnl-line').getAttribute('points')
  expect(points!.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
})
