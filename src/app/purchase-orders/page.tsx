import { PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getPurchaseOrderDashboard } from "@/services/purchaseOrder.service";
import { PurchaseOrderActions } from "./purchase-order-actions";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  let dashboard;
  try {
    dashboard = await getPurchaseOrderDashboard(demoShopId);
  } catch {
    dashboard = { purchaseOrders: [], totals: { drafts: 0, pendingApproval: 0, partial: 0, disputed: 0 } };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Enterprise purchasing</p>
          <h1 className="mt-2 text-3xl font-bold">Purchase Orders</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Auto-drafted reorder POs, approval chains, partial receiving, landed cost, three-way match, supplier email, and backorder intelligence.
          </p>
        </div>
        <PurchaseOrderActions />
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Drafts" value={dashboard.totals.drafts} />
        <Metric label="Pending approval" value={dashboard.totals.pendingApproval} tone="text-amber-700" />
        <Metric label="Partially received" value={dashboard.totals.partial} tone="text-amber-700" />
        <Metric label="Disputed" value={dashboard.totals.disputed} tone="text-signal" />
      </section>

      <ListControls
        searchPlaceholder="Search POs by PO number, supplier, approval tier, or tracking"
        filters={["Status", "Supplier", "Approval tier", "Receiving state"]}
        bulkActions={["Bulk approve", "Email suppliers", "Export selected"]}
        columnViews={["Purchasing", "Receiving", "Landed cost"]}
        exportLabel="Export POs"
      />

      {dashboard.purchaseOrders.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="No purchase orders yet"
          body="Generate nightly auto-drafts or create a draft PO manually. Drafts are grouped by supplier and routed into approval."
          actionHref="/purchase-orders"
          actionLabel="Generate auto-drafts"
        />
      ) : (
        <section className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Morning PO dashboard</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Approval</th>
                  <th>Receiving</th>
                  <th>Backorders</th>
                  <th>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.purchaseOrders.map((po) => {
                  const total = po.lines.reduce((sum, line) => sum + line.orderedQuantity * Number(line.unitPrice), 0) + Number(po.freightCost) + Number(po.customsCost) + Number(po.handlingCost);
                  const ordered = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
                  const received = po.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
                  return (
                    <tr key={po.id}>
                      <td className="font-semibold">{po.poNumber}</td>
                      <td>{po.supplier.name}</td>
                      <td><StatusBadge status={po.status} /></td>
                      <td>${total.toFixed(2)}</td>
                      <td>{po.approvalTier ?? "Not routed"}</td>
                      <td>{received}/{ordered}</td>
                      <td>{po.backorderReminders.length}</td>
                      <td>{po.trackingNumber ?? "None"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
