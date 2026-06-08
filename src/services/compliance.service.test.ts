import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PERMISSION_MATRIX,
  PERMISSIONS,
  assignUserRole,
  assertUserPermission,
  canUser,
  exportAuditLogsCsv,
  recordAuditLog,
  seedDefaultRolePermissions,
  updateRolePermission,
  verifyAuditLogIntegrity
} from "./compliance.service";

describe("compliance.service", () => {
  it("defines granular defaults for all requested roles", () => {
    expect(DEFAULT_PERMISSION_MATRIX.OWNER).toEqual(expect.arrayContaining(["billing.manage", "settings.api_keys", "purchase_orders.approve"]));
    expect(DEFAULT_PERMISSION_MATRIX.AUDITOR).toContain("compliance.audit.export");
    expect(DEFAULT_PERMISSION_MATRIX.AUDITOR).not.toContain("inventory.adjust");
    expect(PERMISSIONS).toContain("suppliers.delete");
  });

  it("seeds the full permission matrix per shop", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      rolePermission: { upsert: vi.fn().mockResolvedValue({ id: "perm_1" }) }
    } as any;

    await seedDefaultRolePermissions("shop_1", db);

    expect(db.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId_role_permission: { shopId: "shop_1", role: "OWNER", permission: "billing.manage" } } })
    );
  });

  it("assigns roles and writes an audit event", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      userRoleAssignment: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "assignment_1", userId: "user_1", role: "AUDITOR", active: true })
      },
      complianceAuditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "audit_1", ...data }))
      }
    } as any;

    await assignUserRole({ shopId: "shop_1", userId: "user_1", role: "AUDITOR", assignedBy: "owner_1" }, db);

    expect(db.userRoleAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ role: "AUDITOR" }) }));
    expect(db.complianceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actionType: "roles.assignment.create", entityModel: "UserRoleAssignment" }) })
    );
  });

  it("updates role permissions and logs old and new values", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      rolePermission: {
        findUnique: vi.fn().mockResolvedValue({ id: "perm_1", enabled: true }),
        upsert: vi.fn().mockResolvedValue({ id: "perm_1", role: "AUDITOR", permission: "reports.export", enabled: false })
      },
      complianceAuditLog: {
        findFirst: vi.fn().mockResolvedValue({ recordHash: "prior_hash" }),
        create: vi.fn().mockResolvedValue({ id: "audit_1" })
      }
    } as any;

    await updateRolePermission({ shopId: "shop_1", role: "AUDITOR", permission: "reports.export", enabled: false }, db);

    expect(db.complianceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousHash: "prior_hash", actionType: "roles.permission.update" }) })
    );
  });

  it("creates tamper-evident audit logs with chained hashes", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      complianceAuditLog: {
        findFirst: vi.fn().mockResolvedValue({ recordHash: "previous_hash" }),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "audit_1", ...data }))
      }
    } as any;

    const log = await recordAuditLog(
      {
        shopId: "shop_1",
        userId: "user_1",
        role: "INVENTORY_MANAGER",
        permission: "inventory.adjust",
        actionType: "inventory.adjust",
        entityModel: "InventoryAdjustment",
        entityId: "adj_1",
        oldValue: { quantity: 10 },
        newValue: { quantity: 8 },
        ipAddress: "127.0.0.1",
        userAgent: "vitest"
      },
      db
    );

    expect(log.previousHash).toBe("previous_hash");
    expect(log.recordHash).toHaveLength(64);
  });

  it("verifies audit log immutability and detects tampering", async () => {
    let previousHash: string | null = null;
    const logs: any[] = [];
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      complianceAuditLog: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(previousHash ? { recordHash: previousHash } : null)),
        create: vi.fn().mockImplementation(({ data }) => {
          previousHash = data.recordHash;
          logs.push(data);
          return Promise.resolve({ id: `audit_${logs.length}`, ...data });
        })
      }
    } as any;

    await recordAuditLog(
      {
        shopId: "shop_1",
        userId: "owner_1",
        role: "OWNER",
        permission: "settings.roles",
        actionType: "roles.assignment.create",
        entityModel: "UserRoleAssignment",
        entityId: "role_1",
        newValue: { role: "AUDITOR" },
        shopifySyncStatus: "NOT_SYNCED"
      },
      db
    );
    await recordAuditLog(
      {
        shopId: "shop_1",
        userId: "auditor_1",
        role: "AUDITOR",
        permission: "reports.export",
        actionType: "reports.export",
        entityModel: "Report",
        entityId: "report_1",
        newValue: { format: "CSV" },
        shopifySyncStatus: "SUCCESS",
        shopifySyncResult: { status: 200 }
      },
      db
    );

    expect(verifyAuditLogIntegrity(logs)).toBe(true);
    expect(verifyAuditLogIntegrity([{ ...logs[0] }, { ...logs[1], newValue: { format: "PDF" } }])).toBe(false);
    expect(db.complianceAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it("checks effective permissions from assigned roles", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      userRoleAssignment: { findUnique: vi.fn().mockResolvedValue({ role: "WAREHOUSE_STAFF", active: true }) },
      rolePermission: { findUnique: vi.fn().mockResolvedValue({ enabled: false }) }
    } as any;

    await expect(canUser({ shopId: "shop_1", userId: "user_1", permission: "inventory.adjust" }, db)).resolves.toBe(false);
  });

  it("throws when role permission enforcement denies an action", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      userRoleAssignment: { findUnique: vi.fn().mockResolvedValue({ role: "AUDITOR", active: true }) },
      rolePermission: { findUnique: vi.fn().mockResolvedValue(null) }
    } as any;

    await expect(assertUserPermission({ shopId: "shop_1", userId: "auditor_1", permission: "inventory.adjust" }, db)).rejects.toThrow(
      "Permission inventory.adjust denied"
    );
  });

  it("exports audit logs for compliance review", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      complianceAuditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            timestamp: new Date("2026-06-08T12:00:00.000Z"),
            userId: "user_1",
            role: "OWNER",
            permission: "settings.roles",
            actionType: "roles.assignment.create",
            entityModel: "UserRoleAssignment",
            entityId: "assignment_1",
            ipAddress: "127.0.0.1",
            userAgent: "vitest",
            shopifySyncStatus: "NOT_SYNCED",
            previousHash: null,
            recordHash: "hash_1"
          }
        ])
      }
    } as any;

    const csv = await exportAuditLogsCsv("shop_1", db);

    expect(csv).toContain("timestamp,userId,role,permission");
    expect(csv).toContain("roles.assignment.create");
  });
});
