import { Metric } from "@/components/Metric";
import { getDemandForecastDashboard } from "@/services/demandSensing.service";
import { DemandSignalPanel } from "./signal-panel";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function DemandPage() {
  const dashboard = await getDemandForecastDashboard(demoShopId).catch(() => ({ forecasts: [], accuracy: [], poorAccuracy: [], averageMape: 0 }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Predictive demand sensing</p>
        <h1 className="mt-2 text-3xl font-bold">Demand Forecasts</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          External trends, discount stripping, return-rate adjustment, seasonal decomposition, cold starts, restock halo, and MAPE tuning.
        </p>
      </header>
      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Forecasts" value={dashboard.forecasts.length} />
        <Metric label="Average MAPE" value={`${dashboard.averageMape}%`} />
        <Metric label="Poor accuracy SKUs" value={dashboard.poorAccuracy.length} tone="text-amber-700" />
      </section>
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <DemandSignalPanel />
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4"><h2 className="font-semibold">Forecast accuracy dashboard</h2></div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>SKU</th><th>MAPE</th><th>Suggestion</th></tr></thead>
              <tbody>
                {dashboard.accuracy.length === 0 ? (
                  <tr><td colSpan={3}>Accuracy results appear after forecast-vs-actual data is recorded.</td></tr>
                ) : dashboard.accuracy.map((row) => (
                  <tr key={row.id}>
                    <td className="font-semibold">{row.product.sku}</td>
                    <td>{Number(row.mape).toFixed(1)}%</td>
                    <td>{row.tuningSuggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
