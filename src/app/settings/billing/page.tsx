import { CreditCard, Gauge, Package } from "lucide-react";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { BILLING_PLANS, calculateSkuOverage, getBillingDashboard } from "@/services/billing.service";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const dashboard = await loadDashboard();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Billing</p>
        <h1 className="mt-2 text-3xl font-bold">Plans, Limits & Usage</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Transparent subscription tiers, SKU/location/store limits, and $0.01 per-SKU overage visibility.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Current plan" value={dashboard.plan.name} />
        <Metric label="SKU usage" value={dashboard.usage.skuLimit === null ? `${dashboard.usage.skuCount}` : `${dashboard.usage.skuCount}/${dashboard.usage.skuLimit}`} />
        <Metric label="SKU overage" value={`$${(dashboard.usage.overageAmountCents / 100).toFixed(2)}`} tone={dashboard.usage.overageSkus > 0 ? "text-signal" : undefined} />
        <Metric label="Locations" value={dashboard.usage.locationCount} />
      </section>

      <ListControls
        searchPlaceholder="Search plans, limits, features, usage, or overage rules"
        filters={["Plan", "Feature family", "SKU limit", "Store limit"]}
        bulkActions={["Export usage", "Compare selected", "Review limits"]}
        columnViews={["Plans", "Usage", "Features"]}
        exportLabel="Export billing"
      />

      <section className="grid gap-4 xl:grid-cols-5">
        {dashboard.plans.map((plan) => (
          <article className="imp-band p-4" key={plan.key}>
            <CreditCard className="text-emerald-700" size={22} aria-hidden />
            <h2 className="mt-3 font-semibold">{plan.name}</h2>
            <p className="mt-2 text-2xl font-bold">{plan.monthlyPriceCents === null ? "Custom" : `$${(plan.monthlyPriceCents / 100).toFixed(0)}`}</p>
            <p className="text-sm text-steel">per month</p>
            <div className="mt-4 space-y-2 text-sm text-steel">
              <p><Package className="mr-1 inline text-emerald-700" size={15} aria-hidden /> {plan.skuLimit === null ? "Unlimited SKUs" : `${plan.skuLimit.toLocaleString()} SKUs`}</p>
              <p><Gauge className="mr-1 inline text-emerald-700" size={15} aria-hidden /> {plan.locationLimit === null ? "Unlimited locations" : `${plan.locationLimit} location${plan.locationLimit === 1 ? "" : "s"}`}</p>
              <p>{plan.storeLimit === null ? "Unlimited stores" : `${plan.storeLimit} store${plan.storeLimit === 1 ? "" : "s"}`}</p>
            </div>
            <ul className="mt-4 space-y-1 text-sm text-steel">
              {plan.features.slice(0, 5).map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

async function loadDashboard() {
  try {
    return await getBillingDashboard(demoShopId);
  } catch {
    const plan = BILLING_PLANS.GROWTH;
    const overage = calculateSkuOverage("GROWTH", 2240);
    return {
      subscription: null,
      plan,
      usage: { locationCount: 3, storeCount: 1, ...overage },
      plans: Object.values(BILLING_PLANS)
    };
  }
}
