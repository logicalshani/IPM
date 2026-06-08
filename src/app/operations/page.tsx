import { AlertTriangle, Boxes, PackageX, Repeat2, RotateCcw, Truck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getOperationsDashboard } from "@/services/operationsDashboard.service";
import { OperationsActions } from "./operations-actions";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  let dashboard;
  try {
    dashboard = await getOperationsDashboard(demoShopId);
  } catch {
    dashboard = {
      returns: { returns: [], bySku: [], bySupplier: [], byChannel: [], byCondition: [] },
      expiryAlerts: [],
      warehouse: { snapshots: [], discrepancies: [], fbaStock: [], fbaFees: 0 },
      transferSuggestions: [],
      transfers: [],
      rules: [],
      openRmas: [],
      metrics: { returnUnits: 0, returnValue: 0, expiringUnits: 0, warehouseDiscrepancies: 0, discrepancyUnits: 0, transferSuggestions: 0, inTransitUnits: 0, openRmas: 0 }
    };
  }

  const hasOperationalData =
    dashboard.returns.returns.length > 0 ||
    dashboard.expiryAlerts.length > 0 ||
    dashboard.warehouse.snapshots.length > 0 ||
    dashboard.transferSuggestions.length > 0 ||
    dashboard.transfers.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Operations intelligence</p>
          <h1 className="mt-2 text-3xl font-bold">Returns, Lots, 3PL & Locations</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Make returns first-class, track batches and recalls, reconcile warehouse partners, and move stock between locations before Shopify availability breaks.
          </p>
        </div>
        <OperationsActions
          sampleProductId={dashboard.returns.returns[0]?.productId ?? dashboard.warehouse.snapshots[0]?.productId ?? dashboard.rules[0]?.productId}
        />
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Returned units" value={dashboard.metrics.returnUnits} />
        <Metric label="Expiring units" value={dashboard.metrics.expiringUnits} tone="text-amber-700" />
        <Metric label="3PL mismatches" value={dashboard.metrics.warehouseDiscrepancies} tone={dashboard.metrics.warehouseDiscrepancies > 0 ? "text-signal" : undefined} />
        <Metric label="Transfer suggestions" value={dashboard.metrics.transferSuggestions} />
      </section>

      <ListControls
        searchPlaceholder="Search returns, batches, 3PL snapshots, transfers, or locations"
        filters={["Condition", "Expiry window", "3PL provider", "Location"]}
        bulkActions={["Create RMA", "Dispose selected", "Export selected"]}
        columnViews={["Returns", "Batches", "Warehouses"]}
        exportLabel="Export ops"
      />

      {!hasOperationalData ? (
        <EmptyState
          icon={Boxes}
          title="No operations intelligence yet"
          body="Returns, batch receipts, 3PL snapshots, and transfer suggestions will populate this command center."
          actionHref="/operations"
          actionLabel="Generate transfers"
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Return & RMA intelligence</h2>
          </div>
          {dashboard.returns.returns.length === 0 ? (
            <EmptyState icon={RotateCcw} title="No returns logged" body="Return intake captures condition, AI restocking decision, supplier fault, and forecast impact." actionHref="/operations" actionLabel="Review intake" />
          ) : (
            <div className="overflow-x-auto">
              <table className="imp-table">
                <thead><tr><th>Order</th><th>SKU</th><th>Condition</th><th>Decision</th><th>Units</th><th>AI reason</th></tr></thead>
                <tbody>
                  {dashboard.returns.returns.slice(0, 6).map((row) => (
                    <tr key={row.id}>
                      <td>{row.orderName ?? "Manual"}</td>
                      <td className="font-semibold">{row.product.sku}</td>
                      <td><StatusBadge status={row.condition} /></td>
                      <td>{row.restockingDecision ?? "Review"}</td>
                      <td>{row.quantity}</td>
                      <td>{row.aiReason ?? "Pending AI decision"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Supplier RMA queue</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {dashboard.openRmas.length === 0 ? (
              <p className="p-4 text-sm text-steel">Supplier RMA drafts appear when defect rates cross the threshold.</p>
            ) : dashboard.openRmas.map((rma) => (
              <article className="p-4" key={rma.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{rma.rmaNumber}</p>
                  <StatusBadge status={rma.status} />
                </div>
                <p className="mt-1 text-sm text-steel">{rma.supplier.name} defect rate {Number(rma.defectRate).toFixed(1)}%</p>
                <p className="mt-2 text-sm text-steel">{rma.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Expiry, batch, and recall control</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Batch</th><th>SKU</th><th>Location</th><th>Expiry</th><th>Qty</th><th>Action</th></tr></thead>
              <tbody>
                {dashboard.expiryAlerts.length === 0 ? (
                  <tr><td colSpan={6}>No batches inside the 90-day expiry window.</td></tr>
                ) : dashboard.expiryAlerts.map((batch) => (
                  <tr key={batch.id}>
                    <td className="font-semibold">{batch.batchNumber}</td>
                    <td>{batch.product.sku}</td>
                    <td>{batch.location.name}</td>
                    <td>{batch.daysUntilExpiry} days</td>
                    <td>{batch.quantityRemaining}</td>
                    <td className={batch.recommendedAction === "Dispose" ? "variance-critical" : "text-amber-700"}>{batch.recommendedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">3PL / warehouse sync</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Provider</th><th>SKU</th><th>Location</th><th>3PL</th><th>Shopify</th><th>Status</th><th>FBA fee</th></tr></thead>
              <tbody>
                {dashboard.warehouse.snapshots.length === 0 ? (
                  <tr><td colSpan={7}>Daily 3PL snapshots will show Shopify-vs-warehouse discrepancies.</td></tr>
                ) : dashboard.warehouse.snapshots.slice(0, 8).map((snapshot) => (
                  <tr key={snapshot.id}>
                    <td>{snapshot.provider}</td>
                    <td className="font-semibold">{snapshot.product.sku}</td>
                    <td>{snapshot.locationName}</td>
                    <td>{snapshot.threePLQuantity}</td>
                    <td>{snapshot.shopifyQuantity}</td>
                    <td><StatusBadge status={snapshot.status} /></td>
                    <td>${Number(snapshot.fbaFee).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Smart transfer suggestions</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {dashboard.transferSuggestions.length === 0 ? (
              <p className="p-4 text-sm text-steel">The algorithm flags locations with months of excess stock against stores with days left.</p>
            ) : dashboard.transferSuggestions.map((suggestion) => (
              <article className="p-4" key={suggestion.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">Urgency {Number(suggestion.urgencyScore).toFixed(0)}</p>
                  <p className="text-sm text-steel">${Number(suggestion.costEstimate).toFixed(2)} transfer cost</p>
                </div>
                <p className="mt-1 text-sm text-steel">{suggestion.reason}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {suggestion.lines.map((line) => (
                    <div className="rounded-md border border-gray-200 p-3" key={line.id}>
                      <p className="font-semibold">{line.sku}</p>
                      <p className="text-sm text-steel">Move {line.quantity} units. Source {Number(line.monthsAtSource).toFixed(1)} months, destination {Number(line.daysAtDestination).toFixed(1)} days.</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Location-level controls</h2>
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-2">
            <Metric label="In-transit units" value={dashboard.metrics.inTransitUnits} />
            <Metric label="Open RMAs" value={dashboard.metrics.openRmas} tone={dashboard.metrics.openRmas > 0 ? "text-amber-700" : undefined} />
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>SKU</th><th>ABC</th><th>Reorder point</th><th>Reorder qty</th></tr></thead>
              <tbody>
                {dashboard.rules.length === 0 ? (
                  <tr><td colSpan={4}>Location-specific replenishment rules appear after setup.</td></tr>
                ) : dashboard.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="font-semibold">{rule.product.sku}</td>
                    <td>{rule.abcClass ?? "Unclassified"}</td>
                    <td>{rule.reorderPoint}</td>
                    <td>{rule.reorderQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {dashboard.warehouse.discrepancies.length > 0 && (
        <section className="imp-band border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-red-700" size={20} aria-hidden />
            <div>
              <h2 className="font-semibold text-red-900">Warehouse reconciliation alert</h2>
              <p className="mt-1 text-sm text-red-800">
                {dashboard.metrics.discrepancyUnits} units are mismatched across 3PL snapshots. Sync Shopify or investigate receiving drift before making replenishment decisions.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="imp-band p-4">
          <PackageX className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Return forecasting impact</h2>
          <p className="mt-1 text-sm text-steel">High-return SKUs are included in the demand model as downward net-demand adjustments.</p>
        </div>
        <div className="imp-band p-4">
          <Truck className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Connector skeletons</h2>
          <p className="mt-1 text-sm text-steel">ShipBob, Flexport, Deliverr, Amazon FBA, and generic webhook payloads share the same sync pipeline.</p>
        </div>
        <div className="imp-band p-4">
          <Repeat2 className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">In-transit inventory</h2>
          <p className="mt-1 text-sm text-steel">Transfers remove stock from the source and hold it outside sellable inventory until receipt is confirmed.</p>
        </div>
      </section>
    </div>
  );
}
