import { prisma } from "@/lib/prisma";
import { ListControls } from "@/components/ListControls";
import { FEATURE_KEYS } from "@/services/feature.service";
import { FeatureToggle } from "./feature-toggle";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function FeatureSettingsPage() {
  const features = process.env.DATABASE_URL
    ? await prisma.feature.findMany({ where: { shopId: demoShopId }, orderBy: { key: "asc" } }).catch(() => [])
    : [];
  const rows = Object.values(FEATURE_KEYS).map((key) => ({
    key,
    status: features.find((feature) => feature.key === key)?.status ?? "DISABLED"
  }));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Billing controls</p>
        <h1 className="mt-2 text-3xl font-bold">Feature Flags</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Every new module is controlled per shop and billing plan before it appears in production workflows.
        </p>
      </header>
      <ListControls
        searchPlaceholder="Search feature flags by module, plan gate, status, or rollout"
        filters={["Status", "Billing plan", "Module group", "Rollout state"]}
        bulkActions={["Enable selected", "Disable selected", "Export flags"]}
        columnViews={["Modules", "Plans", "Rollout"]}
        exportLabel="Export flags"
      />
      <section className="imp-band divide-y divide-gray-200">
        {rows.map((feature) => (
          <FeatureToggle featureKey={feature.key} status={feature.status} key={feature.key} />
        ))}
      </section>
    </div>
  );
}
