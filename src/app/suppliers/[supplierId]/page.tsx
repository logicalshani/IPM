import { notFound } from "next/navigation";
import { DetailPageFrame } from "@/components/DetailPageFrame";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getSupplierDetail } from "@/services/supplierLeadTime.service";
import { SupplierEmailDraftPanel } from "./supplier-email-draft-panel";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({ params }: { params: { supplierId: string } }) {
  let supplier;
  try {
    supplier = await getSupplierDetail(demoShopId, params.supplierId);
  } catch {
    notFound();
  }

  return (
    <DetailPageFrame
      breadcrumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: supplier.name }]}
      status={Number(supplier.reliabilityScore) < 60 ? "NEEDS_INVESTIGATION" : "ACTIVE"}
      actions={["Email supplier", "Request price list", "Export PO history", "Archive supplier"]}
      activity={[
        { title: "Score refreshed", body: `Reliability score is ${Number(supplier.reliabilityScore).toFixed(0)} from current PO evidence.`, when: "Today" },
        { title: "PO evidence loaded", body: `${supplier.purchaseOrders.length} purchase orders included in this drilldown.`, when: "Now" }
      ]}
    >
      <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Supplier drilldown</p>
        <h1 className="mt-2 text-3xl font-bold">{supplier.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          PO history, delivery deltas, fill-rate evidence, price-list changes, contract terms, and communication thread.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Reliability score" value={Number(supplier.reliabilityScore).toFixed(0)} formula="Reliability Score = on-time rate x 0.5 + fill rate x 0.3 + invoice accuracy x 0.2" />
        <Metric label="On-time delivery" value={`${Number(supplier.onTimeRate).toFixed(0)}%`} />
        <Metric label="Fill rate" value={`${Number(supplier.fillRate).toFixed(0)}%`} />
        <Metric label="Invoice accuracy" value={`${Number(supplier.invoiceAccuracy).toFixed(0)}%`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">PO history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead>
                <tr>
                  <th>PO</th>
                  <th>Promised</th>
                  <th>Actual</th>
                  <th>Delay</th>
                  <th>Fill</th>
                  <th>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {supplier.purchaseOrders.map((po) => {
                  const ordered = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
                  const received = po.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
                  return (
                    <tr key={po.id}>
                      <td className="font-semibold">{po.poNumber}</td>
                      <td>{po.promisedDeliveryDate?.toLocaleDateString() ?? "Not promised"}</td>
                      <td>{po.actualDeliveryDate?.toLocaleDateString() ?? "Open"}</td>
                      <td className={(po.deliveryDeltaDays ?? 0) > 3 ? "variance-critical" : (po.deliveryDeltaDays ?? 0) > 0 ? "variance-warning" : "variance-match"}>
                        {po.deliveryDeltaDays ?? 0} days
                      </td>
                      <td>{ordered ? Math.round((received / ordered) * 100) : 0}%</td>
                      <td>{po.invoiceAccurate === null ? "Unaudited" : po.invoiceAccurate ? "Accurate" : "Mismatch"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="imp-band p-4">
            <h2 className="font-semibold">Lead-time profiles</h2>
            <div className="mt-4 space-y-3">
              {supplier.leadTimes.length === 0 ? (
                <p className="text-sm text-steel">No category lead-time profile yet.</p>
              ) : (
                supplier.leadTimes.map((leadTime) => (
                  <div className="rounded border border-gray-200 p-3" key={leadTime.id}>
                    <p className="font-semibold">{leadTime.category}</p>
                    <p className="text-sm text-steel">
                      {leadTime.minimumDays}-{leadTime.maximumDays} days, dynamic {Number(leadTime.dynamicEstimateDays).toFixed(1)} days
                    </p>
                    {Number(leadTime.recentDegradationPercent) > 20 && <StatusBadge status="NEEDS_INVESTIGATION" />}
                  </div>
                ))
              )}
            </div>
          </div>
          <SupplierEmailDraftPanel supplierId={supplier.id} supplierEmail={supplier.email ?? ""} />
        </div>
      </section>

      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Communication thread</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {supplier.communications.length === 0 ? (
            <p className="p-4 text-sm text-steel">No communications logged yet.</p>
          ) : (
            supplier.communications.map((communication) => (
              <article className="p-4" key={communication.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold">{communication.subject ?? communication.channel}</p>
                  <StatusBadge status={communication.status.toUpperCase()} />
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-steel">{communication.body}</p>
              </article>
            ))
          )}
        </div>
      </section>
      </div>
    </DetailPageFrame>
  );
}
