import { Brain, Building2, Mail, Palette, Pin, Repeat2, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getPlatformInfrastructureDashboard } from "@/services/platformInfrastructure.service";
import { InfrastructureActions } from "./infrastructure-actions";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function PlatformInfrastructurePage() {
  const dashboard = await loadDashboard();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Platform infrastructure</p>
        <h1 className="mt-2 text-3xl font-bold">White-Label, Multi-Store & AI Memory</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Agency resale controls, one-login multi-store management, cross-store transfer intelligence, and persistent AI context for team decisions.
        </p>
      </header>

      <InfrastructureActions />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="White-label active" value={dashboard.metrics.whiteLabelActive ? "Yes" : "No"} />
        <Metric label="Managed stores" value={dashboard.metrics.storeCount} />
        <Metric label="Top store" value={dashboard.metrics.topStoreName} />
        <Metric label="Pinned AI insights" value={dashboard.metrics.pinnedInsights} />
      </section>

      <ListControls
        searchPlaceholder="Search stores, domains, transfer suggestions, AI memories, or pins"
        filters={["Store status", "White-label status", "Transfer urgency", "AI confidence"]}
        bulkActions={["Export stores", "Pin selected", "Create transfers"]}
        columnViews={["Stores", "Agency", "AI memory"]}
        exportLabel="Export platform"
      />

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Palette className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">Agency white-label mode</h2>
            </div>
          </div>
          {dashboard.whiteLabel ? (
            <div className="p-4">
              <div className="rounded-md border border-gray-200 p-4" style={{ borderTop: `6px solid ${dashboard.whiteLabel.primaryColor}` }}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase text-steel">{dashboard.whiteLabel.agencyName}</p>
                    <h3 className="mt-1 text-2xl font-bold">{dashboard.whiteLabel.brandName}</h3>
                    <p className="mt-2 text-sm text-steel">{dashboard.whiteLabel.customDomain ?? "Custom domain pending"}</p>
                  </div>
                  <StatusBadge status={dashboard.whiteLabel.status} />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Info icon={Mail} label="Support email" value={dashboard.whiteLabel.supportEmail} />
                  <Info icon={ShieldCheck} label="Email sender" value={dashboard.whiteLabel.emailFromName} />
                </div>
                <p className="mt-4 rounded-md bg-gray-50 p-3 text-sm text-steel">{dashboard.whiteLabel.pdfFooterText ?? "Branded PDF footer will appear on exports."}</p>
              </div>
            </div>
          ) : (
            <EmptyState icon={Palette} title="No white-label profile yet" body="Save agency branding to activate custom logo, colors, email identity, PDF footers, support email, and custom domain." actionHref="/platform/infrastructure" actionLabel="Open quick actions" />
          )}
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">Multi-store management</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Store</th><th>Status</th><th>Efficiency</th><th>30d revenue</th><th>Inventory value</th></tr></thead>
              <tbody>
                {dashboard.stores.length === 0 ? (
                  <tr><td colSpan={5}>Connect Shopify stores to compare inventory efficiency across the portfolio.</td></tr>
                ) : dashboard.stores.map((store) => (
                  <tr key={store.id}>
                    <td>
                      <p className="font-semibold">{store.name}</p>
                      <p className="text-xs text-steel">{store.shopifyDomain}</p>
                    </td>
                    <td><StatusBadge status={store.status} /></td>
                    <td>{Number(store.inventoryEfficiencyScore).toFixed(0)}/100</td>
                    <td>${Number(store.revenue30d).toFixed(0)}</td>
                    <td>${Number(store.inventoryValue).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Repeat2 className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">Cross-store transfer suggestions</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Move</th><th>SKU</th><th>Qty</th><th>Value</th><th>Urgency</th></tr></thead>
              <tbody>
                {dashboard.transfers.length === 0 ? (
                  <tr><td colSpan={5}>Transfer suggestions appear when one store is overstocked and another is understocked.</td></tr>
                ) : dashboard.transfers.map((transfer) => (
                  <tr key={transfer.id}>
                    <td>
                      <p className="font-semibold">{transfer.fromStore.name} to {transfer.toStore.name}</p>
                      <p className="text-xs text-steel">{transfer.reason}</p>
                    </td>
                    <td>{transfer.sku}</td>
                    <td>{transfer.quantity}</td>
                    <td>${Number(transfer.valueMoved).toFixed(0)}</td>
                    <td>{Number(transfer.urgencyScore).toFixed(0)}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="imp-band p-4">
          <h2 className="font-semibold">Cross-store analytics</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <Metric label="Top efficiency score" value={`${dashboard.metrics.topStoreEfficiency.toFixed(0)}/100`} />
            <Metric label="Portfolio inventory" value={`$${dashboard.metrics.totalInventoryValue.toFixed(0)}`} />
            <Metric label="Portfolio 30d revenue" value={`$${dashboard.metrics.totalRevenue30d.toFixed(0)}`} />
            <Metric label="AI remembered topics" value={dashboard.metrics.rememberedTopics} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Brain className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">AI memory & proactive context</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {dashboard.memories.length === 0 ? (
              <p className="p-4 text-sm text-steel">AI memory appears after merchant questions are captured.</p>
            ) : dashboard.memories.map((memory) => (
              <article className="p-4" key={memory.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{memory.topic}</p>
                    <p className="mt-1 text-sm text-steel">{memory.summary}</p>
                  </div>
                  <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">{Number(memory.importance).toFixed(0)}</span>
                </div>
                <p className="mt-2 text-xs text-steel">Asked {memory.queryCount} time{memory.queryCount === 1 ? "" : "s"}; last: {memory.lastQuestion}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <Pin className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">AI insight pinboard</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {dashboard.pinnedInsights.length === 0 ? (
              <p className="p-4 text-sm text-steel">Pinned AI recommendations appear here for team reference.</p>
            ) : dashboard.pinnedInsights.map((pin) => (
              <article className="p-4" key={pin.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{pin.title}</h3>
                  <StatusBadge status={pin.confidence} />
                </div>
                <p className="mt-2 text-sm text-steel">{pin.insight}</p>
                {pin.sourceQuestion && <p className="mt-2 text-xs text-steel">Source: {pin.sourceQuestion}</p>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-200 p-3">
      <Icon className="text-emerald-700" size={18} aria-hidden />
      <div>
        <p className="text-xs font-semibold uppercase text-steel">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

async function loadDashboard() {
  try {
    return await getPlatformInfrastructureDashboard(demoShopId);
  } catch {
    return demoInfrastructureDashboard();
  }
}

function demoInfrastructureDashboard() {
  const stores = [
    {
      id: "demo-store-main",
      shopId: demoShopId,
      shopifyDomain: "demo-main.myshopify.com",
      name: "Main Store",
      currency: "USD",
      status: "CONNECTED",
      inventoryEfficiencyScore: 91,
      revenue30d: 42800,
      inventoryValue: 18600,
      unitsOnHand: 640,
      lastSyncedAt: new Date("2026-06-08"),
      createdAt: new Date("2026-06-08"),
      updatedAt: new Date("2026-06-08")
    },
    {
      id: "demo-store-outlet",
      shopId: demoShopId,
      shopifyDomain: "demo-outlet.myshopify.com",
      name: "Outlet Store",
      currency: "USD",
      status: "CONNECTED",
      inventoryEfficiencyScore: 63,
      revenue30d: 12100,
      inventoryValue: 27400,
      unitsOnHand: 980,
      lastSyncedAt: new Date("2026-06-08"),
      createdAt: new Date("2026-06-08"),
      updatedAt: new Date("2026-06-08")
    }
  ];
  const [mainStore, outletStore] = stores;
  return {
    whiteLabel: {
      id: "demo-white-label",
      shopId: demoShopId,
      agencyName: "Northstar Shopify Agency",
      brandName: "Northstar Inventory OS",
      logoUrl: null,
      primaryColor: "#0f766e",
      accentColor: "#111827",
      supportEmail: "support@northstar.example",
      customDomain: "inventory.northstar.example",
      emailFromName: "Northstar Inventory",
      pdfFooterText: "Powered by Northstar Inventory OS",
      status: "ACTIVE",
      createdAt: new Date("2026-06-08"),
      updatedAt: new Date("2026-06-08")
    },
    stores,
    transfers: [
      {
        id: "demo-transfer",
        shopId: demoShopId,
        fromStoreId: outletStore.id,
        toStoreId: mainStore.id,
        sku: "TEE-114",
        productName: "Core Tee",
        quantity: 72,
        urgencyScore: 88,
        valueMoved: 648,
        reason: "Outlet has 6.3 months of Core Tee stock while Main Store is projected to stock out in 9 days.",
        status: "SUGGESTED",
        createdAt: new Date("2026-06-08"),
        updatedAt: new Date("2026-06-08"),
        fromStore: outletStore,
        toStore: mainStore
      }
    ],
    memories: [
      {
        id: "demo-memory-tee",
        shopId: demoShopId,
        userId: "ops@example.com",
        productId: null,
        sku: "TEE-114",
        topic: "sku:TEE-114",
        queryCount: 7,
        lastQuestion: "What is my Black Friday stockout risk for TEE-114?",
        summary: "Merchant repeatedly checks seasonal availability and reorder risk for Core Tee.",
        importance: 96,
        createdAt: new Date("2026-06-08"),
        updatedAt: new Date("2026-06-08")
      }
    ],
    pinnedInsights: [
      {
        id: "demo-pin",
        shopId: demoShopId,
        sessionId: null,
        title: "Protect Core Tee availability",
        insight: "TEE-114 is a repeated AI focus and should stay visible until seasonal PO coverage is approved.",
        sourceQuestion: "What is my Black Friday stockout risk for TEE-114?",
        confidence: "High",
        tags: ["AI memory", "stockout"],
        createdBy: "ops@example.com",
        createdAt: new Date("2026-06-08"),
        updatedAt: new Date("2026-06-08")
      }
    ],
    metrics: {
      whiteLabelActive: true,
      storeCount: stores.length,
      topStoreName: "Main Store",
      topStoreEfficiency: 91,
      totalInventoryValue: 46000,
      totalRevenue30d: 54900,
      pinnedInsights: 1,
      rememberedTopics: 1
    }
  };
}
