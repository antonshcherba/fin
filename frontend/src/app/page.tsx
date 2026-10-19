import { Header } from '@/components/Header'
import { Panel, Placeholder } from '@/components/Panel'
import { PnlChart } from '@/components/PnlChart'
import { PortfolioHeatmap } from '@/components/PortfolioHeatmap'
import { PositionsTable } from '@/components/PositionsTable'
import { TradeBar } from '@/components/TradeBar'

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
          <PortfolioHeatmap />
        </Panel>
        <Panel title="P&L" className="col-span-3 row-span-2">
          <PnlChart />
        </Panel>
        <Panel title="Positions & Trade" className="col-span-3 row-span-2">
          <TradeBar />
          <PositionsTable />
        </Panel>
      </main>
    </div>
  )
}
