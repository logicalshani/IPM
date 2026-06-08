import { AlertTriangle, Sparkles, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Metric } from "@/components/Metric";
import { getExecutiveDashboard } from "@/services/reporting.service";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function ExecutiveDashboardPage() {
  let dashboard;
  try {
    dashboard = await getExecutiveDashboard(demoShopId);
  } catch {
    dashboard = {
      healthScore: 0,
      capitalEfficiency: 0,
      totalInventoryValue: 0,
      cashLocked: 0,
      opportunities: [],
      risks: [],
      narrative: "Connect reporting data to generate a weekly owner narrative.",
      comparisons: { lastWeek: { previous: 0, delta: 0 }, lastMonth: { previous: 0, delta: 0 }, lastYear: { previous: 0, delta: 0 } }
    };
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Executive dashboard</p>
        <h1 className="mt-2 text-3xl font-bold">Inventory Owner View</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          A one-page health score, capital efficiency readout, weekly AI narrative, top opportunities, and top risks.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Health score" value={`${dashboard.healthScore}/100`} tone={dashboard.healthScore < 60 ? "text-signal" : "text-emerald-700"} />
        <Metric label="Capital efficiency" value={`${dashboard.capitalEfficiency}%`} />
        <Metric label="Inventory value" value={`$${dashboard.totalInventoryValue.toFixed(0)}`} />
        <Metric label="Cash locked" value={`$${dashboard.cashLocked.toFixed(0)}`} tone="text-amber-700" />
      </section>

      <section className="imp-band p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 text-emerald-700" size={22} aria-hidden />
          <div>
            <h2 className="font-semibold">Weekly AI narrative</h2>
            <p className="mt-2 text-sm text-steel">{dashboard.narrative}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Vs last week" value={`${dashboard.comparisons.lastWeek.delta >= 0 ? "+" : ""}${dashboard.comparisons.lastWeek.delta}`} />
        <Metric label="Vs last month" value={`${dashboard.comparisons.lastMonth.delta >= 0 ? "+" : ""}${dashboard.comparisons.lastMonth.delta}`} />
        <Metric label="Vs last year" value={`${dashboard.comparisons.lastYear.delta >= 0 ? "+" : ""}${dashboard.comparisons.lastYear.delta}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Top 5 opportunities</h2>
          </div>
          {dashboard.opportunities.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No opportunities yet" body="Opportunity ranking appears after sales, inventory, and cost data are connected." actionHref="/reports" actionLabel="Open reports" />
          ) : (
            <div className="divide-y divide-gray-200">
              {dashboard.opportunities.map((item, index) => (
                <article className="p-4" key={`${item.title}-${index}`}>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-steel">{item.impact}</p>
                  <p className="mt-2 text-sm font-medium text-emerald-700">{item.action}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Top 5 risks</h2>
          </div>
          {dashboard.risks.length === 0 ? (
            <EmptyState icon={AlertTriangle} title="No ranked risks yet" body="Stockout, supplier, shrinkage, and cash-flow risks appear after operational data is present." actionHref="/reports/low-stock" actionLabel="Review risk" />
          ) : (
            <div className="divide-y divide-gray-200">
              {dashboard.risks.map((item, index) => (
                <article className="p-4" key={`${item.title}-${index}`}>
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-steel">{item.impact}</p>
                  <p className="mt-2 text-sm font-medium text-signal">{item.action}</p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
