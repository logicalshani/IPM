import Link from "next/link";
import { Bot, Cable, Cloud, KeyRound, PlugZap, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { getPlatformDashboard, getShopifyInstallStatus, SHOPIFY_WEBHOOK_TOPICS } from "@/services/platformIntegration.service";
import { PlatformActions } from "./platform-actions";
import { ShopifyInstallForm } from "./shopify-install-form";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function PlatformPage({
  searchParams
}: {
  searchParams?: { installed?: string; shop?: string; shopify_install_error?: string };
}) {
  let dashboard;
  try {
    dashboard = await getPlatformDashboard(demoShopId);
  } catch {
    dashboard = {
      connections: [],
      logs: [],
      accountingExports: [],
      chatConnections: [],
      offlineSyncs: [],
      apiKeys: [],
      webhooks: [],
      flowEvents: [],
      metrics: { connected: 0, failedLogs: 0, queuedOffline: 0, activeApiKeys: 0 }
    };
  }
  const requestedShop = searchParams?.shop;
  const shopifyInstallStatus =
    searchParams?.installed === "shopify" && requestedShop
      ? await getShopifyInstallStatus({ shop: requestedShop }).catch(() => null)
      : null;
  const showShopifyInstallError = Boolean(searchParams?.shopify_install_error || (searchParams?.installed === "shopify" && requestedShop && !shopifyInstallStatus?.installed));

  return (
    <div className="space-y-6">
      <header>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Integrations & platform</p>
          <h1 className="mt-2 text-3xl font-bold">Shopify, Accounting, Bots, PWA & API</h1>
          <p className="mt-2 max-w-3xl text-sm text-steel">
            Webhook ingestion, Shopify metafields and Flow events, accounting exports, Slack and Teams commands, offline mobile sync, and enterprise API access.
          </p>
        </div>
      </header>

      <PlatformActions />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            showShopifyInstallError
              ? "border-red-200 bg-red-50 text-red-800"
              : shopifyInstallStatus?.installed
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-white text-steel"
          }`}
          role="status"
        >
          {searchParams?.shopify_install_error ? (
            <p>{searchParams.shopify_install_error}</p>
          ) : searchParams?.installed === "shopify" && requestedShop && !shopifyInstallStatus?.installed ? (
            <p>Shopify redirected back for {requestedShop}, but IMP did not find a saved Shopify Admin API connection. Start the install from this same browser and approve the app in Shopify.</p>
          ) : shopifyInstallStatus?.installed ? (
            <p>Shopify connected for {requestedShop ?? "this store"}. Webhooks, metafields, Flow events, and sync logs can now use this connection.</p>
          ) : (
            <p>Install the Shopify app from here when testing with a development store. The OAuth callback stores a connected Shopify Admin API integration.</p>
          )}
        </div>
        <ShopifyInstallForm />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Connected surfaces" value={dashboard.metrics.connected} />
        <Metric label="Failed sync logs" value={dashboard.metrics.failedLogs} tone={dashboard.metrics.failedLogs > 0 ? "text-signal" : undefined} />
        <Metric label="Queued offline syncs" value={dashboard.metrics.queuedOffline} />
        <Metric label="Active API keys" value={dashboard.metrics.activeApiKeys} />
      </section>

      <ListControls
        searchPlaceholder="Search integrations, sync logs, webhooks, API keys, or channels"
        filters={["Provider", "Status", "Retry state", "Plan access"]}
        bulkActions={["Retry sync", "Rotate keys", "Export selected"]}
        columnViews={["Connections", "Logs", "API"]}
        exportLabel="Export logs"
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="imp-band overflow-hidden xl:col-span-2">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Connection status</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Provider</th><th>Name</th><th>Status</th><th>Last sync</th></tr></thead>
              <tbody>
                {dashboard.connections.length === 0 && dashboard.chatConnections.length === 0 ? (
                  <tr><td colSpan={4}>Use quick actions to connect Shopify, accounting, Slack, Teams, API keys, and outbound webhooks.</td></tr>
                ) : (
                  <>
                    {dashboard.connections.map((connection) => (
                      <tr key={connection.id}>
                        <td>{connection.provider}</td>
                        <td>{connection.name}</td>
                        <td><StatusBadge status={connection.status} /></td>
                        <td>{connection.lastSyncedAt?.toISOString().slice(0, 10) ?? "Not synced"}</td>
                      </tr>
                    ))}
                    {dashboard.chatConnections.map((connection) => (
                      <tr key={connection.id}>
                        <td>{connection.provider}</td>
                        <td>{connection.channelName}</td>
                        <td><StatusBadge status={connection.status} /></td>
                        <td>{connection.updatedAt.toISOString().slice(0, 10)}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Shopify integration</h2>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <div className="rounded-md border border-gray-200 p-3">
              <PlugZap className="text-emerald-700" size={20} aria-hidden />
              <p className="mt-2 font-semibold">Webhook coverage</p>
              <p className="mt-1 text-sm text-steel">{SHOPIFY_WEBHOOK_TOPICS.length} topics: product, inventory, order, fulfillment, refund, uninstall.</p>
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <Cloud className="text-emerald-700" size={20} aria-hidden />
              <p className="mt-2 font-semibold">Metafields & Flow</p>
              <p className="mt-1 text-sm text-steel">Reorder point, lead time, ABC class, and IMP custom automation events.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>Endpoint</th><th>Status</th><th>Retries</th><th>When</th></tr></thead>
              <tbody>
                {dashboard.logs.length === 0 ? (
                  <tr><td colSpan={4}>Sync logs appear after platform calls.</td></tr>
                ) : dashboard.logs.slice(0, 8).map((log) => (
                  <tr key={log.id}>
                    <td>{log.endpoint}</td>
                    <td><StatusBadge status={log.status} /></td>
                    <td>{log.retryCount}</td>
                    <td>{log.occurredAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <h2 className="font-semibold">Accounting depth</h2>
          </div>
          {dashboard.accountingExports.length === 0 ? (
            <EmptyState icon={Cable} title="No accounting exports yet" body="QuickBooks Online, Xero, and generic CSV journal entries are ready to receive valuation, COGS, and bill exports." actionHref="/api/openapi" actionLabel="View API docs" />
          ) : (
            <table className="imp-table">
              <thead><tr><th>Provider</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {dashboard.accountingExports.map((row) => (
                  <tr key={row.id}><td>{row.provider}</td><td>{row.type}</td><td>${Number(row.amount).toFixed(2)}</td><td><StatusBadge status={row.status} /></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="imp-band p-4">
          <Bot className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Slack / Teams bot</h2>
          <p className="mt-1 text-sm text-steel">Daily inventory digest, real-time low-stock alerts, and `/imp reorder SKU` command handling.</p>
          <p className="mt-3 text-3xl font-bold">{dashboard.chatConnections.length}</p>
          <p className="text-sm text-steel">connected channels</p>
        </div>
        <div className="imp-band p-4">
          <Smartphone className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Mobile PWA</h2>
          <p className="mt-1 text-sm text-steel">Installable offline-first warehouse flow with scan, receive, count, transfer, and 48px tap targets.</p>
          <Link className="mt-4 inline-block rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href="/mobile">Open mobile mode</Link>
        </div>
        <div className="imp-band p-4">
          <KeyRound className="text-emerald-700" size={22} aria-hidden />
          <h2 className="mt-3 font-semibold">Public API</h2>
          <p className="mt-1 text-sm text-steel">Inventory, suppliers, purchase orders, stock counts, alerts, outbound webhooks, and rate limits by plan.</p>
          <Link className="mt-4 inline-block rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-ink" href="/api/openapi">OpenAPI JSON</Link>
        </div>
      </section>

      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Outbound webhooks</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="imp-table">
            <thead><tr><th>Target URL</th><th>Events</th><th>Status</th></tr></thead>
            <tbody>
              {dashboard.webhooks.length === 0 ? (
                <tr><td colSpan={3}>External systems can subscribe to IMP events from the public API module.</td></tr>
              ) : dashboard.webhooks.map((webhook) => (
                <tr key={webhook.id}><td>{webhook.targetUrl}</td><td>{JSON.stringify(webhook.eventTypes)}</td><td>{webhook.active ? "Active" : "Paused"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
