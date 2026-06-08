import Link from "next/link";
import { BellRing, CheckCircle2, Handshake, PackageSearch, Store, UserPlus } from "lucide-react";

const steps = [
  {
    title: "Connect Shopify",
    body: "Authorize product, order, inventory, POS, fulfillment, and refund webhooks.",
    icon: Store,
    href: "/platform"
  },
  {
    title: "Import products",
    body: "Pull variants, locations, inventory levels, Stocky CSVs, and historical movements.",
    icon: PackageSearch,
    href: "/platform/migration"
  },
  {
    title: "Add suppliers",
    body: "Create supplier records, lead-time profiles, contracts, and price tiers.",
    icon: Handshake,
    href: "/suppliers"
  },
  {
    title: "Configure alerts",
    body: "Set low-stock, lead-time degradation, expiry, cash, and sync thresholds.",
    icon: BellRing,
    href: "/settings/features"
  },
  {
    title: "Invite team",
    body: "Assign owner, admin, inventory, purchasing, warehouse, and auditor access.",
    icon: UserPlus,
    href: "/compliance"
  }
];

export default function OnboardingPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Setup wizard</p>
          <h1 className="mt-2 text-3xl font-bold">Launch Inventory Manager Pro</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Complete the five setup steps that make IMP operational for Shopify data, suppliers, alerts, and team governance.
          </p>
        </div>
        <Link className="inline-flex min-h-12 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white" href="/dashboard/executive">
          Open dashboard
        </Link>
      </header>

      <section className="grid gap-4 lg:grid-cols-5">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Link className="imp-band block p-4 transition hover:border-emerald-700" href={step.href} key={step.title}>
              <div className="flex items-center justify-between gap-3">
                <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">
                  <Icon size={20} aria-hidden />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-steel">Step {index + 1}</span>
              </div>
              <h2 className="mt-4 font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-steel">{step.body}</p>
            </Link>
          );
        })}
      </section>

      <section className="imp-band p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 text-emerald-700" size={22} aria-hidden />
            <div>
              <h2 className="font-semibold">Investor-demo readiness checklist</h2>
              <p className="mt-1 text-sm text-steel">Shopify sync, supplier intelligence, alert rules, billing features, and compliance roles are linked from this setup flow.</p>
            </div>
          </div>
          <Link className="inline-flex min-h-12 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-semibold text-ink" href="/settings/billing">
            Review plan gates
          </Link>
        </div>
      </section>
    </div>
  );
}
