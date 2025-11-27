import { TradingWorkspace } from "@/components/trading/TradingWorkspace";

export default function HomePage() {
  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Portfolio cockpit</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Multi-broker trade entry, metrics, and FX-aware totals.
        </h1>
        <p className="max-w-3xl text-lg text-slate-600">
          Capture single trades with validation, align broker CSV exports to your schema, and keep multi-currency
          positions in sync with average cost, realized/unrealized P/L, dividends, and fee coverage.
        </p>
      </div>

      <TradingWorkspace />
    </section>
  );
}
