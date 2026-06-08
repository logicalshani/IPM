import Link from "next/link";
import { AlertTriangle, Handshake, TrendingDown, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { getSupplierDashboard } from "@/services/supplierLeadTime.service";
import { SupplierCreateForm } from "./supplier-create-form";
import { SupplierInsightPanel } from "./supplier-insight-panel";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  let dashboard;
  try {
    dashboard = await getSupplierDashboard(demoShopId);
  } catch {
    dashboard = {
      suppliers: [],
      leadTimeAlerts: [],
      contracts: [],
      delayBuckets: [],
      bestSupplier: null,
      worstSupplier: null,
      totals: { suppliers: 0, below60: 0, expiringContracts: 0, degradedLeadTimes: 0 }
    };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Supplier intelligence</p>
          <h1 className="mt-2 text-3xl font-bold">Supplier Performance</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Lead-time reliability, fill rates, invoice accuracy, PO variance history, seasonal risk, and replacement supplier signals.
          </p>
        </div>
        <SupplierCreateForm />
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Suppliers" value={dashboard.totals.suppliers} />
        <Metric label="Below score 60" value={dashboard.totals.below60} tone="text-signal" />
        <Metric label="Lead-time alerts" value={dashboard.totals.degradedLeadTimes} tone="text-amber-700" />
        <Metric label="Expiring contracts" value={dashboard.totals.expiringContracts} tone="text-amber-700" />
      </section>

      <ListControls
        searchPlaceholder="Search suppliers by name, email, score, category, or contract"
        filters={["Reliability band", "Category", "Lead-time risk", "Contract status"]}
        bulkActions={["Email selected", "Request price list", "Export selected"]}
        columnViews={["Scorecard", "Lead time", "Contracts"]}
        exportLabel="Export suppliers"
      />

      {dashboard.suppliers.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No suppliers tracked yet"
          body="Add a supplier, then record lead-time profiles and purchase order evidence to start scoring reliability."
          actionHref="/suppliers?new=true"
          actionLabel="Add supplier"
        />
      ) : (
        <section className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Scorecard grid</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Reliability</th>
                  <th>Trend</th>
                  <th>On-time</th>
                  <th>Fill rate</th>
                  <th>Invoice accuracy</th>
                  <th>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.suppliers.map((supplier) => {
                  const score = Number(supplier.reliabilityScore);
                  const previous = Number(supplier.previousReliabilityScore);
                  const TrendIcon = score >= previous ? TrendingUp : TrendingDown;
                  const leadTime = supplier.leadTimes[0];
                  return (
                    <tr key={supplier.id}>
                      <td>
                        <Link className="font-semibold text-ink underline-offset-2 hover:underline" href={`/suppliers/${supplier.id}`}>
                          {supplier.name}
                        </Link>
                        <p className="text-xs text-steel">{supplier.email ?? "No email on file"}</p>
                      </td>
                      <td className={score < 60 ? "variance-critical" : score < 80 ? "variance-warning" : "variance-match"}>
                        {score.toFixed(0)}
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-1">
                          <TrendIcon size={16} aria-hidden />
                          {(score - previous).toFixed(1)}
                        </span>
                      </td>
                      <td>{Number(supplier.onTimeRate).toFixed(0)}%</td>
                      <td>{Number(supplier.fillRate).toFixed(0)}%</td>
                      <td>{Number(supplier.invoiceAccuracy).toFixed(0)}%</td>
                      <td>{leadTime ? `${Number(leadTime.dynamicEstimateDays).toFixed(1)} days` : "No profile"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1.2fr]">
        <div className="imp-band p-4">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={18} aria-hidden />
            <h2 className="font-semibold">Best supplier</h2>
          </div>
          {dashboard.bestSupplier ? (
            <p className="text-sm text-steel">
              <span className="font-semibold text-ink">{dashboard.bestSupplier.name}</span> is leading with a score of{" "}
              {Number(dashboard.bestSupplier.reliabilityScore).toFixed(0)}.
            </p>
          ) : (
            <p className="text-sm text-steel">No supplier evidence yet.</p>
          )}
        </div>
        <div className="imp-band p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={18} aria-hidden />
            <h2 className="font-semibold">Worst supplier</h2>
          </div>
          {dashboard.worstSupplier ? (
            <p className="text-sm text-steel">
              <span className="font-semibold text-ink">{dashboard.worstSupplier.name}</span> needs attention at{" "}
              {Number(dashboard.worstSupplier.reliabilityScore).toFixed(0)}.
            </p>
          ) : (
            <p className="text-sm text-steel">No supplier evidence yet.</p>
          )}
        </div>
        <div className="imp-band p-4">
          <h2 className="font-semibold">Average delay distribution</h2>
          <div className="mt-4 space-y-3">
            {dashboard.delayBuckets.map((bucket) => (
              <div className="grid grid-cols-[80px_1fr_36px] items-center gap-3" key={bucket.label}>
                <span className="text-sm text-steel">{bucket.label}</span>
                <div className="h-3 rounded bg-gray-100">
                  <div className="h-3 rounded bg-emerald-600" style={{ width: `${Math.min(bucket.count * 16, 100)}%` }} />
                </div>
                <span className="text-right text-sm font-semibold">{bucket.count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SupplierInsightPanel />
    </div>
  );
}
