import { Boxes, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getStocktakeDashboard } from "@/services/stocktake.service";
import { StocktakeCreateForm } from "./stocktake-create-form";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function StocktakesPage() {
  let dashboard;
  try {
    dashboard = await getStocktakeDashboard(demoShopId);
  } catch {
    dashboard = { sessions: [], shrinkage: { bySku: [], byLocation: [] }, totals: { active: 0, pendingApproval: 0, criticalVariances: 0 } };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Core inventory operations</p>
          <h1 className="mt-2 text-3xl font-bold">Inventory Counts</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Full, partial, blind, and cycle stocktakes with live variance control, approval queues, and Shopify sync readiness.
          </p>
        </div>
        <StocktakeCreateForm />
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Active sessions" value={dashboard.totals.active} />
        <Metric label="Pending approval" value={dashboard.totals.pendingApproval} tone="text-amber-700" />
        <Metric label="Critical variances" value={dashboard.totals.criticalVariances} tone="text-signal" />
      </section>

      <ListControls
        searchPlaceholder="Search stocktakes by session, SKU, assignee, or location"
        filters={["Status", "Count mode", "Location", "Assigned user"]}
        bulkActions={["Bulk approve", "Assign recount", "Export selected"]}
        columnViews={["Operations", "Variance", "Approval"]}
        exportLabel="Export counts"
      />

      {dashboard.sessions.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stocktakes yet"
          body="Create the first session, choose a count mode, and seed lines from Shopify inventory by location, category, or supplier."
          actionHref="/inventory/stocktakes?new=true"
          actionLabel="Create stocktake"
        />
      ) : (
        <section className="imp-band overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <h2 className="font-semibold">Recent sessions</h2>
            <Plus size={18} aria-hidden />
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mode</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Variance</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.sessions.map((session) => {
                  const varianceValue = session.lines.reduce((sum, line) => sum + Number(line.varianceValue), 0);
                  const varianceClass =
                    varianceValue === 0 ? "variance-match" : Math.abs(varianceValue) <= 50 ? "variance-warning" : "variance-critical";
                  return (
                    <tr key={session.id}>
                      <td>
                        <a className="font-semibold text-ink underline-offset-2 hover:underline" href={`/inventory/stocktakes/${session.id}`}>
                          {session.name}
                        </a>
                        <p className="text-xs text-steel">{session.lines.length} lines</p>
                      </td>
                      <td>{session.mode}</td>
                      <td>{session.location?.name ?? "All locations"}</td>
                      <td><StatusBadge status={session.status} /></td>
                      <td className={varianceClass}>${varianceValue.toFixed(2)}</td>
                      <td>{session.assignedUser?.name ?? "Unassigned"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="imp-band p-4">
          <h2 className="font-semibold">Shrinkage by SKU</h2>
          <div className="mt-4 space-y-3">
            {dashboard.shrinkage.bySku.length === 0 ? (
              <p className="text-sm text-steel">Variance patterns will appear after approved counts.</p>
            ) : (
              dashboard.shrinkage.bySku.map((item) => (
                <div className="flex items-center justify-between gap-3" key={item.sku}>
                  <div>
                    <p className="font-medium">{item.sku}</p>
                    <p className="text-xs text-steel">{item.name}</p>
                  </div>
                  <p className={Math.abs(item.value) > 50 ? "variance-critical" : "variance-warning"}>${item.value.toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="imp-band p-4">
          <h2 className="font-semibold">Shrinkage by location</h2>
          <div className="mt-4 space-y-3">
            {dashboard.shrinkage.byLocation.length === 0 ? (
              <p className="text-sm text-steel">Chronic location issues will be highlighted here.</p>
            ) : (
              dashboard.shrinkage.byLocation.map((item) => (
                <div className="flex items-center justify-between gap-3" key={item.location}>
                  <p className="font-medium">{item.location}</p>
                  <p className={Math.abs(item.value) > 50 ? "variance-critical" : "variance-warning"}>${item.value.toFixed(2)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
