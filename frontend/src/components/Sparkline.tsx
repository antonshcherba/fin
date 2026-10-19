const W = 100
const H = 24

export function linePoints(values: number[], width: number, height: number): string {
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  return values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(' ')
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div data-testid="sparkline-empty" className="h-6 w-full" />
  const up = values[values.length - 1] >= values[0]
  return (
    <svg
      data-testid="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-6 w-full overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={linePoints(values, W, H)}
        fill="none"
        stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
