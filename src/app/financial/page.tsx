import { AlertTriangle, DollarSign } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { getFinancialDashboard } from "@/services/financialIntelligence.service";
import { FinancialControls } from "./financial-controls";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function FinancialPage() {
  let dashboard;
  try {
    dashboard = await getFinancialDashboard(demoShopId);
  } catch {
    dashboard = {
      settings: { valuationMethod: "FIFO", workingCapitalThreshold: 5000 },
      cashFlow: {
        projected: [],
        cashConversionCycle: { dio: 0, dso: 0, dpo: 0, cashConversionCycle: 0 },
        benchmarks: { dio: 60, dso: 7, dpo: 30 },
        workingCapitalAlert: null
      },
      valuation: { method: "FIFO", rows: [], totals: { fifo: 0, lifo: 0, weightedAverage: 0, selected: 0 } },
      shrinkage: {
        unitsLost: 0,
        valueLost: 0,
        revenue: 0,
        shrinkagePercentOfRevenue: 0,
        byReason: [],
        byLocation: [],
        byCategory: [],
        byStaff: []
      },
      terms: [],
      alerts: []
    };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Financial intelligence</p>
          <h1 className="mt-2 text-3xl font-bold">Inventory Cash & Valuation</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Forecast inventory cash needs, benchmark cash conversion cycle, compare FIFO/LIFO/weighted average, and track tax-ready shrinkage.
          </p>
        </div>
        <FinancialControls />
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="30-day cash need" value={`$${dashboard.cashFlow.projected[0]?.inventoryCashNeeded?.toFixed?.(0) ?? 0}`} tone={dashboard.cashFlow.workingCapitalAlert ? "text-signal" : undefined} />
        <Metric label="CCC days" value={dashboard.cashFlow.cashConversionCycle.cashConversionCycle} />
        <Metric label="Inventory value" value={`$${dashboard.valuation.totals.selected.toFixed(0)}`} />
        <Metric label="Shrinkage value" value={`$${dashboard.shrinkage.valueLost.toFixed(0)}`} tone="text-amber-700" />
      </section>

      <ListControls
        searchPlaceholder="Search valuation rows, cash horizons, suppliers, or shrinkage reasons"
        filters={["Valuation method", "Horizon", "Supplier terms", "Shrinkage reason"]}
        bulkActions={["Export selected", "Send to accounting", "Flag review"]}
        columnViews={["Cash flow", "Valuation", "Shrinkage"]}
        exportLabel="Export finance"
      />

      {dashboard.alerts.length > 0 && (
        <section className="imp-band border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-red-700" size={20} aria-hidden />
            <div>
              <h2 className="font-semibold text-red-900">Working capital alert</h2>
              <p className="mt-1 text-sm text-red-800">{dashboard.alerts[0].message}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">30/60/90-day cash flow projection</h2>
          </div>
          {dashboard.cashFlow.projected.length === 0 ? (
            <EmptyState icon={DollarSign} title="No cash projection yet" body="Pending POs and recent sales will populate inventory cash needs." actionHref="/purchase-orders" actionLabel="Review POs" />
          ) : (
            <table className="imp-table">
              <thead><tr><th>Horizon</th><th>Cash needed</th><th>Sales cash in</th><th>Net position</th></tr></thead>
              <tbody>
                {dashboard.cashFlow.projected.map((row) => (
                  <tr key={row.horizonDays}>
                    <td>{row.horizonDays} days</td>
                    <td>${row.inventoryCashNeeded.toFixed(2)}</td>
                    <td>${row.expectedSalesCashIn.toFixed(2)}</td>
                    <td className={row.netInventoryCashPosition < 0 ? "variance-critical" : "variance-match"}>${row.netInventoryCashPosition.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="imp-band p-4">
          <h2 className="font-semibold">Cash conversion cycle</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric label="DIO" value={dashboard.cashFlow.cashConversionCycle.dio} />
            <Metric label="DSO" value={dashboard.cashFlow.cashConversionCycle.dso} />
            <Metric label="DPO" value={dashboard.cashFlow.cashConversionCycle.dpo} />
          </div>
          <p className="mt-4 text-sm text-steel">
            Benchmarks: DIO {dashboard.cashFlow.benchmarks.dio}, DSO {dashboard.cashFlow.benchmarks.dso}, DPO {dashboard.cashFlow.benchmarks.dpo}.
          </p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Inventory valuation method impact</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>SKU</th><th>Qty</th><th>FIFO</th><th>LIFO</th><th>Weighted avg</th><th>Switch impact</th></tr></thead>
              <tbody>
                {dashboard.valuation.rows.length === 0 ? (
                  <tr><td colSpan={6}>Valuation rows appear after inventory exists.</td></tr>
                ) : dashboard.valuation.rows.map((row) => (
                  <tr key={row.sku}>
                    <td className="font-semibold">{row.sku}</td>
                    <td>{row.quantityOnHand}</td>
                    <td>${row.fifo.toFixed(2)}</td>
                    <td>${row.lifo.toFixed(2)}</td>
                    <td>${row.weightedAverage.toFixed(2)}</td>
                    <td className={row.switchImpact < 0 ? "variance-critical" : "variance-match"}>${row.switchImpact.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Payment terms optimizer</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {dashboard.terms.length === 0 ? (
              <p className="p-4 text-sm text-steel">Supplier terms appear after suppliers are seeded.</p>
            ) : dashboard.terms.slice(0, 5).map((term) => (
              <article className="p-4" key={term.supplierId}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{term.supplierName}</p>
                  <p className="text-sm text-steel">Net {term.netDays}</p>
                </div>
                <p className="mt-1 text-sm text-steel">{term.recommendation}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Monthly shrinkage report</h2>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <Metric label="Units lost" value={dashboard.shrinkage.unitsLost} />
          <Metric label="Value lost" value={`$${dashboard.shrinkage.valueLost.toFixed(2)}`} />
          <Metric label="% revenue" value={`${dashboard.shrinkage.shrinkagePercentOfRevenue.toFixed(2)}%`} />
          <Metric label="Revenue" value={`$${dashboard.shrinkage.revenue.toFixed(0)}`} />
        </div>
      </section>
    </div>
  );
}
