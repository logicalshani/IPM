import Link from "next/link";
import { BarChart3, Boxes, ClipboardList, PackageCheck, PlugZap, ShieldCheck } from "lucide-react";

export default function HomePage() {
  const actions = [
    { href: "/dashboard/executive", label: "Executive dashboard", body: "Owner health score, capital efficiency, top risks, and opportunities.", icon: BarChart3 },
    { href: "/inventory/stocktakes", label: "Start stocktake", body: "Run counts, approve variances, and sync approved adjustments.", icon: Boxes },
    { href: "/purchase-orders", label: "Review purchase orders", body: "Approve, receive, match invoices, and manage backorders.", icon: PackageCheck },
    { href: "/reports", label: "Open reports", body: "Inventory valuation, dead stock, stockout risk, shrinkage, and cash flow.", icon: ClipboardList },
    { href: "/platform", label: "Check integrations", body: "Shopify sync, OpenAPI, accounting, Slack, Teams, and mobile PWA.", icon: PlugZap },
    { href: "/compliance", label: "Audit access", body: "Roles, permissions, immutable logs, and compliance exports.", icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Merchant command center</p>
          <h1 className="mt-2 text-3xl font-bold">Inventory Manager Pro</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Jump straight into the operational workflows a Shopify merchant or admin needs before testing stock, purchasing, reporting, integrations, and compliance.
          </p>
        </div>
        <Link className="inline-flex min-h-12 items-center justify-center rounded-md bg-ink px-4 text-sm font-semibold text-white" href="/onboarding">
          Open setup wizard
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link className="imp-band block p-4 transition hover:border-emerald-700" href={action.href} key={action.href}>
              <div className="rounded-md bg-emerald-50 p-2 text-emerald-700 w-fit">
                <Icon size={20} aria-hidden />
              </div>
              <h2 className="mt-4 font-semibold">{action.label}</h2>
              <p className="mt-2 text-sm text-steel">{action.body}</p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
