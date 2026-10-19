export interface TreemapItem {
  key: string
  value: number
}

export interface TreemapRect {
  key: string
  x: number
  y: number
  w: number
  h: number
}

interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

/** Worst aspect ratio of a row of areas laid along a side of length `side`. */
function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0)
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

/**
 * Squarified treemap (Bruls et al.). Items with non-positive value are dropped;
 * the returned rects tile `width` x `height` in descending value order.
 */
export function squarify(items: TreemapItem[], width: number, height: number): TreemapRect[] {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
  const total = sorted.reduce((sum, i) => sum + i.value, 0)
  if (sorted.length === 0 || total <= 0 || width <= 0 || height <= 0) return []

  const scale = (width * height) / total
  const pending = sorted.map((i) => ({ key: i.key, area: i.value * scale }))
  const rects: TreemapRect[] = []
  let free: Bounds = { x: 0, y: 0, w: width, h: height }

  while (pending.length > 0) {
    const side = Math.min(free.w, free.h)
    const row = [pending[0]]
    let i = 1
    while (
      i < pending.length &&
      worstRatio([...row, pending[i]].map((r) => r.area), side) <=
        worstRatio(row.map((r) => r.area), side)
    ) {
      row.push(pending[i])
      i++
    }
    pending.splice(0, row.length)

    const rowArea = row.reduce((sum, r) => sum + r.area, 0)
    if (free.w >= free.h) {
      const colW = rowArea / free.h
      let y = free.y
      for (const r of row) {
        const h = r.area / colW
        rects.push({ key: r.key, x: free.x, y, w: colW, h })
        y += h
      }
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h }
    } else {
      const rowH = rowArea / free.w
      let x = free.x
      for (const r of row) {
        const w = r.area / rowH
        rects.push({ key: r.key, x, y: free.y, w, h: rowH })
        x += w
      }
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH }
    }
  }
  return rects
}
