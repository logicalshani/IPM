import { CheckCircle2, Eye, FileClock, ShieldCheck, UserCog, XCircle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ListControls } from "@/components/ListControls";
import { Metric } from "@/components/Metric";
import { StatusBadge } from "@/components/StatusBadge";
import { ACCESS_ROLES, PERMISSIONS, getComplianceDashboard, roleLabel } from "@/services/compliance.service";
import { ComplianceActions } from "./compliance-actions";

const demoShopId = "demo-shop";
export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const dashboard = await loadDashboard();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-emerald-700">Roles, permissions & compliance</p>
        <h1 className="mt-2 text-3xl font-bold">RBAC & Forensic Audit Logs</h1>
        <p className="mt-2 max-w-3xl text-sm text-steel">
          Owner-to-auditor role hierarchy, granular permission matrix, immutable write-action trail, Shopify sync evidence, and CSV exports for compliance review.
        </p>
      </header>

      <ComplianceActions />

      <section className="grid gap-3 md:grid-cols-4">
        <Metric label="Roles" value={dashboard.metrics.roleCount} />
        <Metric label="Permissions" value={dashboard.metrics.permissionCount} />
        <Metric label="Active assignments" value={dashboard.metrics.activeAssignments} />
        <Metric label="Audit records shown" value={dashboard.metrics.auditLogCount} />
      </section>

      <ListControls
        searchPlaceholder="Search users, roles, permissions, actions, entities, or audit hashes"
        filters={["Role", "Permission", "Action type", "Shopify sync"]}
        bulkActions={["Export audit logs", "Export matrix", "Review selected"]}
        columnViews={["Roles", "Permissions", "Audit"]}
        exportLabel="Export compliance"
      />

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">Role hierarchy</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {ACCESS_ROLES.map((role, index) => (
              <article className="flex items-center justify-between gap-3 p-4" key={role}>
                <div>
                  <p className="font-semibold">{roleLabel(role)}</p>
                  <p className="text-sm text-steel">{roleDescription(role)}</p>
                </div>
                <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-steel">Level {index + 1}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <UserCog className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">User role assignments</h2>
            </div>
          </div>
          {dashboard.assignments.length === 0 ? (
            <EmptyState icon={UserCog} title="No role assignments yet" body="Assign each user one operational role so every app action can be authorized and audited." actionHref="/compliance" actionLabel="Open compliance" />
          ) : (
            <div className="overflow-x-auto">
              <table className="imp-table">
                <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Assigned</th></tr></thead>
                <tbody>
                  {dashboard.assignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <p className="font-semibold">{assignment.user?.name ?? assignment.userId}</p>
                        <p className="text-xs text-steel">{assignment.user?.email ?? "User record pending"}</p>
                      </td>
                      <td>{roleLabel(assignment.role)}</td>
                      <td><StatusBadge status={assignment.active ? "APPROVED" : "DISABLED"} /></td>
                      <td>{formatDate(assignment.assignedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="imp-band overflow-hidden">
        <div className="border-b border-gray-200 p-4">
          <h2 className="font-semibold">Granular permission matrix</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="imp-table">
            <thead>
              <tr>
                <th>Permission</th>
                {ACCESS_ROLES.map((role) => <th key={role}>{roleLabel(role)}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission}>
                  <td className="font-semibold">{permission}</td>
                  {dashboard.permissionRows.map((row) => {
                    const enabled = row.permissions.find((item) => item.permission === permission)?.enabled ?? false;
                    return (
                      <td key={`${row.role}-${permission}`}>
                        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${enabled ? "text-emerald-700" : "text-red-700"}`}>
                          {enabled ? <CheckCircle2 aria-hidden size={16} /> : <XCircle aria-hidden size={16} />}
                          {enabled ? "Allowed" : "Denied"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.45fr]">
        <div className="imp-band overflow-hidden">
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center gap-2">
              <FileClock className="text-emerald-700" size={20} aria-hidden />
              <h2 className="font-semibold">Forensic audit log</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="imp-table">
              <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Shopify</th><th>Hash</th></tr></thead>
              <tbody>
                {dashboard.auditLogs.length === 0 ? (
                  <tr><td colSpan={6}>Write actions will appear here with old/new JSON, IP, user agent, Shopify sync result, timestamp, and hash chain.</td></tr>
                ) : dashboard.auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.timestamp)}</td>
                    <td>
                      <p className="font-semibold">{log.userId ?? "system"}</p>
                      <p className="text-xs text-steel">{log.role ? roleLabel(log.role) : "No role"}</p>
                    </td>
                    <td>
                      <p className="font-semibold">{log.actionType}</p>
                      <p className="text-xs text-steel">{log.permission ?? "No permission"}</p>
                    </td>
                    <td>{log.entityModel}{log.entityId ? `:${log.entityId}` : ""}</td>
                    <td><StatusBadge status={log.shopifySyncStatus} /></td>
                    <td className="font-mono text-xs">{log.recordHash.slice(0, 12)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="imp-band p-4">
            <Eye className="text-emerald-700" size={22} aria-hidden />
            <h2 className="mt-3 font-semibold">Immutability posture</h2>
            <p className="mt-2 text-sm text-steel">
              Audit records are append-only through the service layer and hash-chained with the prior record hash.
            </p>
          </div>
          <div className="imp-band p-4">
            <h2 className="font-semibold">Latest audit hash</h2>
            <p className="mt-2 break-all font-mono text-xs text-steel">{dashboard.metrics.latestHash}</p>
          </div>
          <Metric label="Denied matrix cells" value={dashboard.metrics.deniedPermissions} />
        </div>
      </section>
    </div>
  );
}

async function loadDashboard() {
  try {
    return await getComplianceDashboard(demoShopId);
  } catch {
    return demoComplianceDashboard();
  }
}

function roleDescription(role: string) {
  const descriptions: Record<string, string> = {
    OWNER: "Full control, billing, API keys, and role governance.",
    ADMIN: "Broad operations control without default billing ownership.",
    INVENTORY_MANAGER: "Inventory counts, adjustments, transfers, reports, and cash visibility.",
    PURCHASING_MANAGER: "PO approvals, suppliers, purchasing workflows, and supplier-facing exports.",
    WAREHOUSE_STAFF: "Receiving, counting, transfers, and PO receiving tasks.",
    AUDITOR: "Read-only evidence access and compliance exports."
  };
  return descriptions[role] ?? "Operational role";
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function demoComplianceDashboard() {
  const permissionRows = ACCESS_ROLES.map((role) => ({
    role,
    permissions: PERMISSIONS.map((permission) => ({
      permission,
      enabled:
        role === "OWNER" ||
        (role === "ADMIN" && permission !== "billing.manage") ||
        (role === "AUDITOR" && ["reports.view", "reports.export", "financial.view", "suppliers.view", "purchase_orders.view", "compliance.audit.view", "compliance.audit.export"].includes(permission)) ||
        (role === "WAREHOUSE_STAFF" && ["inventory.count", "inventory.receive", "inventory.transfer", "purchase_orders.view", "purchase_orders.receive"].includes(permission)) ||
        (role === "PURCHASING_MANAGER" && permission.startsWith("purchase_orders")) ||
        (role === "INVENTORY_MANAGER" && permission.startsWith("inventory"))
    }))
  }));
  const auditLogs = [
    {
      id: "demo-audit-2",
      sequence: BigInt(2),
      shopId: demoShopId,
      userId: "demo-user-ops",
      role: "INVENTORY_MANAGER" as const,
      permission: "inventory.adjust",
      actionType: "inventory.adjust",
      entityModel: "InventoryAdjustment",
      entityId: "demo-shrinkage-tee",
      oldValue: { quantity: 240 },
      newValue: { quantity: 238, reason: "cycle count correction" },
      ipAddress: "127.0.0.1",
      userAgent: "IMP demo console",
      shopifySyncStatus: "SUCCESS" as const,
      shopifySyncResult: { endpoint: "inventory_levels/adjust", status: 200 },
      previousHash: "9b5e7f1d2a0c",
      recordHash: "f7a82a6a74d8e462e1f0a2f7e890c17d8d64fceefeb845bcb54a8d9f7e1aa222",
      timestamp: new Date("2026-06-08T18:25:00.000Z")
    },
    {
      id: "demo-audit-1",
      sequence: BigInt(1),
      shopId: demoShopId,
      userId: "demo-user-owner",
      role: "OWNER" as const,
      permission: "settings.roles",
      actionType: "roles.assignment.create",
      entityModel: "UserRoleAssignment",
      entityId: "demo-role-ops",
      oldValue: null,
      newValue: { userId: "demo-user-ops", role: "INVENTORY_MANAGER" },
      ipAddress: "127.0.0.1",
      userAgent: "IMP demo console",
      shopifySyncStatus: "NOT_SYNCED" as const,
      shopifySyncResult: null,
      previousHash: null,
      recordHash: "9b5e7f1d2a0c4177400167a86f653dd234f04cb5bdbd808e5ac02e82ce13f118",
      timestamp: new Date("2026-06-08T18:20:00.000Z")
    }
  ];

  return {
    permissionRows,
    assignments: [
      {
        id: "demo-role-owner",
        shopId: demoShopId,
        userId: "demo-user-owner",
        role: "OWNER" as const,
        active: true,
        assignedBy: null,
        assignedAt: new Date("2026-06-08T18:00:00.000Z"),
        updatedAt: new Date("2026-06-08T18:00:00.000Z"),
        user: { id: "demo-user-owner", shopId: demoShopId, name: "Store Owner", email: "owner@example.com", role: "owner" }
      },
      {
        id: "demo-role-ops",
        shopId: demoShopId,
        userId: "demo-user-ops",
        role: "INVENTORY_MANAGER" as const,
        active: true,
        assignedBy: "demo-user-owner",
        assignedAt: new Date("2026-06-08T18:10:00.000Z"),
        updatedAt: new Date("2026-06-08T18:10:00.000Z"),
        user: { id: "demo-user-ops", shopId: demoShopId, name: "Ops Lead", email: "ops@example.com", role: "supervisor" }
      }
    ],
    auditLogs,
    metrics: {
      roleCount: ACCESS_ROLES.length,
      permissionCount: PERMISSIONS.length,
      activeAssignments: 2,
      auditLogCount: auditLogs.length,
      deniedPermissions: permissionRows.reduce((sum, row) => sum + row.permissions.filter((permission) => !permission.enabled).length, 0),
      latestHash: auditLogs[0].recordHash
    }
  };
}
