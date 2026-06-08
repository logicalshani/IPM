"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Building2, MoveRight, Palette, Pin } from "lucide-react";

const demoShopId = "demo-shop";

type ActionState = {
  label: string;
  message: string;
  tone: "idle" | "success" | "error";
};

export function InfrastructureActions() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({
    label: "Ready",
    message: "Choose an infrastructure action to configure the partner layer, multi-store control, or AI memory.",
    tone: "idle"
  });

  async function run(label: string, payload: Record<string, unknown>) {
    setState({ label, message: "Working...", tone: "idle" });
    const response = await fetch("/api/platform/infrastructure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setState({ label, message: body.error ?? "Action failed", tone: "error" });
      return;
    }
    setState({ label, message: successMessage(payload.action as string), tone: "success" });
    router.refresh();
  }

  const actions = [
    {
      label: "Save branding",
      icon: Palette,
      payload: {
        action: "white_label",
        shopId: demoShopId,
        agencyName: "Northstar Shopify Agency",
        brandName: "Northstar Inventory OS",
        supportEmail: "support@northstar.example",
        primaryColor: "#0f766e",
        accentColor: "#111827",
        customDomain: "inventory.northstar.example",
        emailFromName: "Northstar Inventory",
        pdfFooterText: "Powered by Northstar Inventory OS",
        status: "ACTIVE"
      }
    },
    {
      label: "Add managed store",
      icon: Building2,
      payload: {
        action: "managed_store",
        shopId: demoShopId,
        shopifyDomain: `outlet-${Date.now()}.myshopify.com`,
        name: "Outlet Store",
        inventoryEfficiencyScore: 84,
        revenue30d: 18600,
        inventoryValue: 9200,
        unitsOnHand: 214
      }
    },
    { label: "Suggest transfer", icon: MoveRight, payload: { action: "suggest_transfers", shopId: demoShopId } },
    {
      label: "Remember AI query",
      icon: Brain,
      payload: {
        action: "remember_ai",
        shopId: demoShopId,
        question: "What is my Black Friday stockout risk for TEE-114?",
        sku: "TEE-114",
        summary: "User repeatedly checks seasonal stockout risk for Core Tee."
      }
    },
    {
      label: "Pin insight",
      icon: Pin,
      payload: {
        action: "pin_insight",
        shopId: demoShopId,
        title: "Protect Core Tee availability",
        insight: "TEE-114 is a recurring AI focus and should stay visible on the owner dashboard until seasonal coverage is locked.",
        sourceQuestion: "What is my Black Friday stockout risk for TEE-114?",
        confidence: "High",
        tags: ["AI memory", "stockout", "TEE-114"],
        createdBy: "ops@example.com"
      }
    }
  ];

  return (
    <section className="imp-band p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="font-semibold">Infrastructure quick actions</h2>
          <p className="mt-1 text-sm text-steel">Configure agency branding, add stores, generate transfer suggestions, and curate AI context.</p>
        </div>
        <div
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : state.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-steel"
          }`}
          role="status"
        >
          <span className="font-semibold">{state.label}:</span> {state.message}
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              className="flex min-h-12 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-emerald-700 hover:text-emerald-800"
              key={action.label}
              onClick={() => run(action.label, action.payload)}
              type="button"
            >
              <Icon aria-hidden size={18} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function successMessage(action: string) {
  if (action === "white_label") return "White-label profile saved for agency resale.";
  if (action === "managed_store") return "Managed store connected to the enterprise console.";
  if (action === "suggest_transfers") return "Cross-store transfer suggestions refreshed.";
  if (action === "remember_ai") return "AI memory updated from the latest merchant question.";
  return "Insight pinned for team reference.";
}
