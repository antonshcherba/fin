import { Header } from '@/components/Header'
import { Panel, Placeholder } from '@/components/Panel'

export default function Home() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="grid min-h-0 flex-1 grid-cols-12 grid-rows-6 gap-1 p-1">
        <Panel title="Watchlist" className="col-span-3 row-span-4">
          <Placeholder label="Watchlist" />
        </Panel>
        <Panel title="Chart" className="col-span-6 row-span-4">
          <Placeholder label="Main chart" />
        </Panel>
        <Panel title="AI Assistant" className="col-span-3 row-span-6">
          <Placeholder label="AI chat" />
        </Panel>
        <Panel title="Portfolio Heatmap" className="col-span-3 row-span-2">
          <Placeholder label="Heatmap" />
        </Panel>
        <Panel title="P&L" className="col-span-3 row-span-2">
          <Placeholder label="P&L chart" />
        </Panel>
        <Panel title="Positions & Trade" className="col-span-3 row-span-2">
          <Placeholder label="Positions table / trade bar" />
        </Panel>
      </main>
    </div>
  )
}
