"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileClock, KeyRound, ShieldCheck, UserCog } from "lucide-react";

const demoShopId = "demo-shop";

type ActionState = {
  label: string;
  message: string;
  tone: "idle" | "success" | "error";
};

export function ComplianceActions() {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({
    label: "Ready",
    message: "Roles, permissions, and audit logging controls are ready.",
    tone: "idle"
  });

  async function run(label: string, payload: Record<string, unknown>) {
    setState({ label, message: "Working...", tone: "idle" });
    const response = await fetch("/api/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setState({ label, message: body.error ?? "Action failed", tone: "error" });
      return;
    }

    if (payload.action === "export_audit") {
      const text = await response.text();
      const blob = new Blob([text], { type: "text/csv" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "imp-audit-log.csv";
      link.click();
    }

    setState({ label, message: successMessage(payload.action as string), tone: "success" });
    router.refresh();
  }

  const actions = [
    { label: "Seed matrix", icon: ShieldCheck, payload: { action: "seed_permissions", shopId: demoShopId } },
    {
      label: "Assign auditor",
      icon: UserCog,
      payload: { action: "assign_role", shopId: demoShopId, userId: "demo-user-ops", role: "AUDITOR", assignedBy: "demo-user-owner", ipAddress: "127.0.0.1", userAgent: "IMP demo console" }
    },
    {
      label: "Lock supplier delete",
      icon: KeyRound,
      payload: { action: "permission", shopId: demoShopId, role: "ADMIN", permission: "suppliers.delete", enabled: false, actorUserId: "demo-user-owner", actorRole: "OWNER", ipAddress: "127.0.0.1", userAgent: "IMP demo console" }
    },
    {
      label: "Record audit",
      icon: FileClock,
      payload: {
        action: "audit",
        shopId: demoShopId,
        userId: "demo-user-ops",
        role: "INVENTORY_MANAGER",
        permission: "inventory.adjust",
        actionType: "inventory.adjust",
        entityModel: "InventoryAdjustment",
        entityId: "demo-adjustment",
        oldValue: { quantity: 240 },
        newValue: { quantity: 238, reason: "cycle count correction" },
        ipAddress: "127.0.0.1",
        userAgent: "IMP demo console",
        shopifySyncStatus: "SUCCESS",
        shopifySyncResult: { endpoint: "inventory_levels/adjust", status: 200 }
      }
    },
    { label: "Export audit", icon: Download, payload: { action: "export_audit", shopId: demoShopId } }
  ];

  return (
    <section className="imp-band p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="font-semibold">Compliance quick actions</h2>
          <p className="mt-1 text-sm text-steel">Manage permissions and produce tamper-evident audit evidence for review.</p>
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
  if (action === "seed_permissions") return "Default permissions seeded for every role.";
  if (action === "assign_role") return "Auditor role assigned and audit logged.";
  if (action === "permission") return "Permission updated and audit logged.";
  if (action === "export_audit") return "Audit CSV exported.";
  return "Forensic audit event recorded.";
}
