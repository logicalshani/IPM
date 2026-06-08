"use client";

import { useState } from "react";

type ActionState = {
  tone: "idle" | "success" | "error";
  message: string;
  secret?: string;
};

export function PlatformActions() {
  const [loading, setLoading] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>({
    tone: "idle",
    message: "Choose an action to test the integration pipeline. Results and errors appear here."
  });

  async function runJson(label: string, url: string, body: Record<string, unknown>, success: (data: any) => ActionState) {
    setLoading(label);
    setState({ tone: "idle", message: `${label} running...` });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Request failed");
      }
      setState(success(payload.data));
    } catch (error) {
      setState({
        tone: "error",
        message: error instanceof Error ? error.message : "Request failed"
      });
    } finally {
      setLoading(null);
    }
  }

  async function exportJournal() {
    setLoading("Export journal CSV");
    setState({ tone: "idle", message: "Export journal CSV running..." });
    try {
      const response = await fetch("/api/platform/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "csv_export",
          rows: [
            { account: "Inventory Asset", debit: 4280, memo: "IMP valuation snapshot" },
            { account: "Inventory Adjustment", credit: 4280, memo: "IMP valuation snapshot" }
          ]
        })
      });
      if (!response.ok) throw new Error("CSV export failed");
      const blob = new Blob([await response.text()], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "imp-journal-entry.csv";
      link.click();
      setState({ tone: "success", message: "CSV journal entry downloaded." });
    } catch (error) {
      setState({ tone: "error", message: error instanceof Error ? error.message : "CSV export failed" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="imp-band max-w-full overflow-hidden p-4" style={{ width: "100%", maxWidth: "calc(100vw - 32px)" }}>
      <div className="flex max-w-full flex-col gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Connection quick actions</h2>
          <p className="mt-1 text-sm text-steel">Connect, test, and export without leaving the Platform console.</p>
        </div>
        <div
          className={`min-w-0 break-words rounded-md border px-3 py-2 text-sm ${
            state.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : state.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-gray-200 bg-gray-50 text-steel"
          }`}
          role="status"
        >
          <p>{state.message}</p>
          {state.secret && <code className="mt-2 block break-all rounded bg-white p-2 text-xs text-ink">{state.secret}</code>}
        </div>
      </div>

      <div className="mt-4 grid max-w-full gap-2" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <button
          className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          disabled={loading !== null}
          onClick={() =>
            runJson(
              "Connect Slack",
              "/api/platform/chat",
              { action: "connect", shopId: "demo-shop", provider: "SLACK", workspaceId: "T-DEMO", channelId: "C-OPS", channelName: "#inventory-ops", botTokenRef: "merchant-managed-token" },
              () => ({ tone: "success", message: "Slack channel connected for daily digests and commands." })
            )
          }
        >
          {loading === "Connect Slack" ? "Connecting..." : "Connect Slack"}
        </button>
        <button
          className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          disabled={loading !== null}
          onClick={() =>
            runJson("Post digest", "/api/platform/chat", { action: "digest", shopId: "demo-shop" }, (data) => ({
              tone: "success",
              message: data.message ?? "Daily inventory digest posted."
            }))
          }
        >
          {loading === "Post digest" ? "Posting..." : "Post digest"}
        </button>
        <button
          className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          disabled={loading !== null}
          onClick={() =>
            runJson(
              "Send stock alert",
              "/api/platform/chat",
              { action: "alert", shopId: "demo-shop", provider: "SLACK", sku: "SKU-1234", quantity: 0, channelId: "C-OPS" },
              (data) => ({ tone: "success", message: data.message ?? "Real-time stock alert sent." })
            )
          }
        >
          {loading === "Send stock alert" ? "Sending..." : "Send stock alert"}
        </button>
        <button
          className="min-h-12 w-full rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={loading !== null}
          onClick={() =>
            runJson("Create API key", "/api/platform/public-api", { action: "api_key", shopId: "demo-shop", name: "Enterprise demo key", plan: "enterprise" }, (data) => ({
              tone: "success",
              message: "Enterprise API key created. Copy it now; this is the only reveal.",
              secret: data.rawKey
            }))
          }
        >
          {loading === "Create API key" ? "Creating..." : "Create API key"}
        </button>
        <button
          className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60"
          disabled={loading !== null}
          onClick={() =>
            runJson(
              "Add webhook",
              "/api/platform/public-api",
              { action: "webhook", shopId: "demo-shop", targetUrl: "https://example.com/imp-events", eventTypes: ["imp.dead_stock_flagged", "imp.low_stock"] },
              () => ({ tone: "success", message: "Outbound webhook subscription created." })
            )
          }
        >
          {loading === "Add webhook" ? "Adding..." : "Add webhook"}
        </button>
        <button className="min-h-12 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-60" disabled={loading !== null} onClick={exportJournal}>
          {loading === "Export journal CSV" ? "Exporting..." : "Export journal"}
        </button>
      </div>
    </section>
  );
}
