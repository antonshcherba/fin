import { describe, expect, it } from 'vitest'
import { squarify } from './treemap'

describe('squarify', () => {
  it('returns nothing for empty or non-positive input', () => {
    expect(squarify([], 100, 100)).toEqual([])
    expect(squarify([{ key: 'A', value: 0 }], 100, 100)).toEqual([])
  })

  it('gives a single item the whole area', () => {
    expect(squarify([{ key: 'A', value: 5 }], 200, 100)).toEqual([{ key: 'A', x: 0, y: 0, w: 200, h: 100 }])
  })

  it('tiles the area with rects proportional to value', () => {
    const items = [
      { key: 'A', value: 6 },
      { key: 'B', value: 3 },
      { key: 'C', value: 2 },
      { key: 'D', value: 1 },
    ]
    const rects = squarify(items, 120, 100)
    const area = (k: string) => {
      const r = rects.find((x) => x.key === k)!
      return r.w * r.h
    }
    expect(rects).toHaveLength(4)
    expect(rects.reduce((s, r) => s + r.w * r.h, 0)).toBeCloseTo(12000)
    expect(area('A')).toBeCloseTo(6000)
    expect(area('D')).toBeCloseTo(1000)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(120 + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-9)
    }
  })
})
