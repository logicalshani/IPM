import { ProfitScenarioPanel } from "./scenario-panel";
import { CompetitorMonitorPanel } from "./competitor-panel";

export default function SimulationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Decision simulation</p>
        <h1 className="mt-2 text-3xl font-bold">Profit & Price Simulations</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Compare purchase scenarios, run Monte Carlo profit distributions, and monitor competitor prices for repricing or bundling actions.
        </p>
      </header>
      <section className="grid gap-4 xl:grid-cols-2">
        <ProfitScenarioPanel />
        <CompetitorMonitorPanel />
      </section>
    </div>
  );
}
