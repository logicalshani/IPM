import { Tags } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { getPricingIntelligence } from "@/services/supplierPricing.service";
import { ContractSummaryPanel } from "./contract-summary-panel";
import { VolumeOptimizerPanel } from "./volume-optimizer-panel";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function SupplierPricingPage() {
  let intelligence;
  try {
    intelligence = await getPricingIntelligence(demoShopId);
  } catch {
    intelligence = {
      priceChanges: [],
      contractAlerts: [],
      totals: { priceChanges: 0, expiringContracts: 0, severeMarginHits: 0 }
    };
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Contract and pricing intelligence</p>
        <h1 className="mt-2 text-3xl font-bold">Supplier Pricing</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Price-list effective dates, MOQ tiers, margin impact, contract expiry alerts, and budget-aware volume discount suggestions.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Price changes" value={intelligence.totals.priceChanges} />
        <Metric label="Severe margin hits" value={intelligence.totals.severeMarginHits} tone="text-signal" />
        <Metric label="Expiring contracts" value={intelligence.totals.expiringContracts} tone="text-amber-700" />
      </section>

      <ListControls
        searchPlaceholder="Search SKUs, suppliers, MOQ tiers, contracts, or margin impacts"
        filters={["Supplier", "Effective date", "Margin risk", "Contract window"]}
        bulkActions={["Upload price list", "Negotiate selected", "Export selected"]}
        columnViews={["Pricing", "Contracts", "Margin"]}
        exportLabel="Export pricing"
      />

      {intelligence.priceChanges.length === 0 && intelligence.contractAlerts.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No pricing alerts yet"
          body="Upload a supplier price list or contract to start detecting SKU cost changes, MOQ thresholds, and renewal risk."
          actionHref="/suppliers/pricing"
          actionLabel="Review pricing tools"
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="imp-band overflow-hidden">
            <div className="border-b border-gray-200 p-4">
              <h2 className="font-semibold">Price change detection</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="imp-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Supplier</th>
                    <th>Change</th>
                    <th>Margin impact</th>
                  </tr>
                </thead>
                <tbody>
                  {intelligence.priceChanges.map((item) => (
                    <tr key={item.id}>
                      <td className="font-semibold">{item.sku}</td>
                      <td>{item.priceList.supplier.name}</td>
                      <td className={Number(item.priceChangePercent) > 0 ? "variance-critical" : "variance-match"}>
                        {Number(item.priceChangePercent).toFixed(1)}%
                      </td>
                      <td>${Number(item.marginImpact).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="imp-band overflow-hidden">
            <div className="border-b border-gray-200 p-4">
              <h2 className="font-semibold">Contract expiry alerts</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {intelligence.contractAlerts.map((contract) => (
                <div className="p-4" key={contract.id}>
                  <p className="font-semibold">{contract.title}</p>
                  <p className="text-sm text-steel">
                    {contract.supplier.name} renews in {contract.daysUntilRenewal} days ({contract.alertWindowDays}-day alert)
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <VolumeOptimizerPanel />
        <ContractSummaryPanel />
      </section>
    </div>
  );
}
