import type { AccessRole, AuditSyncStatus, Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export const ACCESS_ROLES = ["OWNER", "ADMIN", "INVENTORY_MANAGER", "PURCHASING_MANAGER", "WAREHOUSE_STAFF", "AUDITOR"] as const;

export const PERMISSIONS = [
  "ai.query",
  "ai.feedback",
  "ai.pin_insight",
  "inventory.count",
  "inventory.adjust",
  "inventory.transfer",
  "inventory.receive",
  "purchase_orders.view",
  "purchase_orders.create",
  "purchase_orders.approve",
  "purchase_orders.send",
  "purchase_orders.receive",
  "suppliers.view",
  "suppliers.create",
  "suppliers.update",
  "suppliers.delete",
  "reports.view",
  "reports.export",
  "financial.view",
  "financial.settings",
  "settings.features",
  "settings.api_keys",
  "settings.roles",
  "billing.manage",
  "platform.integrations",
  "platform.white_label",
  "compliance.audit.view",
  "compliance.audit.export"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_PERMISSION_MATRIX: Record<AccessRole, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: PERMISSIONS.filter((permission) => permission !== "billing.manage"),
  INVENTORY_MANAGER: [
    "ai.query",
    "ai.feedback",
    "inventory.count",
    "inventory.adjust",
    "inventory.transfer",
    "inventory.receive",
    "purchase_orders.view",
    "purchase_orders.receive",
    "suppliers.view",
    "reports.view",
    "reports.export",
    "financial.view",
    "compliance.audit.view"
  ],
  PURCHASING_MANAGER: [
    "ai.query",
    "ai.feedback",
    "purchase_orders.view",
    "purchase_orders.create",
    "purchase_orders.approve",
    "purchase_orders.send",
    "purchase_orders.receive",
    "suppliers.view",
    "suppliers.create",
    "suppliers.update",
    "reports.view",
    "reports.export",
    "financial.view",
    "platform.integrations",
    "compliance.audit.view"
  ],
  WAREHOUSE_STAFF: ["inventory.count", "inventory.transfer", "inventory.receive", "purchase_orders.view", "purchase_orders.receive"],
  AUDITOR: ["reports.view", "reports.export", "financial.view", "suppliers.view", "purchase_orders.view", "compliance.audit.view", "compliance.audit.export"]
};

export type AuditInput = {
  shopId: string;
  userId?: string;
  role?: AccessRole;
  permission?: string;
  actionType: string;
  entityModel: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  shopifySyncStatus?: AuditSyncStatus;
  shopifySyncResult?: unknown;
};

export async function seedDefaultRolePermissions(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.rolesCompliance, db);
  const permissions = [];
  const inputs = ACCESS_ROLES.flatMap((role) => PERMISSIONS.map((permission) => ({ role, permission })));
  const batchSize = 5;

  for (let index = 0; index < inputs.length; index += batchSize) {
    const batch = inputs.slice(index, index + batchSize);
    permissions.push(
      ...(await Promise.all(
        batch.map(({ role, permission }) =>
          db.rolePermission.upsert({
          where: { shopId_role_permission: { shopId, role, permission } },
          create: { shopId, role, permission, enabled: DEFAULT_PERMISSION_MATRIX[role].includes(permission) },
          update: { enabled: DEFAULT_PERMISSION_MATRIX[role].includes(permission) }
          })
        )
      ))
    );
  }

  return permissions;
}

export async function assignUserRole(
  input: { shopId: string; userId: string; role: AccessRole; assignedBy?: string; ipAddress?: string; userAgent?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.rolesCompliance, db);
  const oldValue = await db.userRoleAssignment.findUnique({ where: { shopId_userId: { shopId: input.shopId, userId: input.userId } } });
  const assignment = await db.userRoleAssignment.upsert({
    where: { shopId_userId: { shopId: input.shopId, userId: input.userId } },
    create: { shopId: input.shopId, userId: input.userId, role: input.role, assignedBy: input.assignedBy, active: true },
    update: { role: input.role, assignedBy: input.assignedBy, active: true, assignedAt: new Date() }
  });

  await recordAuditLog(
    {
      shopId: input.shopId,
      userId: input.assignedBy,
      role: "OWNER",
      permission: "settings.roles",
      actionType: oldValue ? "roles.assignment.update" : "roles.assignment.create",
      entityModel: "UserRoleAssignment",
      entityId: assignment.id,
      oldValue: oldValue as unknown as Prisma.InputJsonValue,
      newValue: assignment as unknown as Prisma.InputJsonValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    },
    db
  );

  return assignment;
}

export async function updateRolePermission(
  input: { shopId: string; role: AccessRole; permission: Permission; enabled: boolean; actorUserId?: string; actorRole?: AccessRole; ipAddress?: string; userAgent?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.rolesCompliance, db);
  const oldValue = await db.rolePermission.findUnique({ where: { shopId_role_permission: { shopId: input.shopId, role: input.role, permission: input.permission } } });
  const permission = await db.rolePermission.upsert({
    where: { shopId_role_permission: { shopId: input.shopId, role: input.role, permission: input.permission } },
    create: { shopId: input.shopId, role: input.role, permission: input.permission, enabled: input.enabled },
    update: { enabled: input.enabled }
  });

  await recordAuditLog(
    {
      shopId: input.shopId,
      userId: input.actorUserId,
      role: input.actorRole,
      permission: "settings.roles",
      actionType: "roles.permission.update",
      entityModel: "RolePermission",
      entityId: permission.id,
      oldValue: oldValue as unknown as Prisma.InputJsonValue,
      newValue: permission as unknown as Prisma.InputJsonValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    },
    db
  );

  return permission;
}

export async function assertUserPermission(input: { shopId: string; userId: string; permission: Permission }, db: PrismaClient = prisma) {
  const allowed = await canUser(input, db);
  if (!allowed) throw new Error(`Permission ${input.permission} denied`);
}

export async function canUser(input: { shopId: string; userId: string; permission: Permission }, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.rolesCompliance, db);
  const assignment = await db.userRoleAssignment.findUnique({ where: { shopId_userId: { shopId: input.shopId, userId: input.userId } } });
  if (!assignment?.active) return false;
  if (assignment.role === "OWNER") return true;
  const permission = await db.rolePermission.findUnique({
    where: { shopId_role_permission: { shopId: input.shopId, role: assignment.role, permission: input.permission } }
  });
  return permission?.enabled ?? DEFAULT_PERMISSION_MATRIX[assignment.role].includes(input.permission);
}

export async function recordAuditLog(input: AuditInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.rolesCompliance, db);
  const previous = await db.complianceAuditLog.findFirst({ where: { shopId: input.shopId }, orderBy: { sequence: "desc" }, select: { recordHash: true } });
  const timestamp = new Date();
  const oldValue = jsonSnapshot(input.oldValue);
  const newValue = jsonSnapshot(input.newValue);
  const shopifySyncResult = jsonSnapshot(input.shopifySyncResult);
  const payload = {
    shopId: input.shopId,
    userId: input.userId,
    role: input.role,
    permission: input.permission,
    actionType: input.actionType,
    entityModel: input.entityModel,
    entityId: input.entityId,
    oldValue,
    newValue,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    shopifySyncStatus: input.shopifySyncStatus ?? "NOT_SYNCED",
    shopifySyncResult,
    previousHash: previous?.recordHash,
    timestamp: timestamp.toISOString()
  };
  const recordHash = hashPayload(payload);

  return db.complianceAuditLog.create({
    data: {
      shopId: input.shopId,
      userId: input.userId,
      role: input.role,
      permission: input.permission,
      actionType: input.actionType,
      entityModel: input.entityModel,
      entityId: input.entityId,
      oldValue,
      newValue,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      shopifySyncStatus: input.shopifySyncStatus ?? "NOT_SYNCED",
      shopifySyncResult,
      previousHash: previous?.recordHash,
      recordHash,
      timestamp
    }
  });
}

export async function getComplianceDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.rolesCompliance, db);
  const [rolePermissions, assignments, auditLogs] = await Promise.all([
    db.rolePermission.findMany({ where: { shopId }, orderBy: [{ role: "asc" }, { permission: "asc" }] }),
    db.userRoleAssignment.findMany({ where: { shopId }, include: { user: true }, orderBy: [{ role: "asc" }, { assignedAt: "desc" }] }),
    db.complianceAuditLog.findMany({ where: { shopId }, orderBy: { sequence: "desc" }, take: 25 })
  ]);

  const permissionRows = ACCESS_ROLES.map((role) => ({
    role,
    permissions: PERMISSIONS.map((permission) => {
      const override = rolePermissions.find((row) => row.role === role && row.permission === permission);
      return { permission, enabled: override?.enabled ?? DEFAULT_PERMISSION_MATRIX[role].includes(permission) };
    })
  }));

  return {
    permissionRows,
    assignments,
    auditLogs,
    metrics: {
      roleCount: ACCESS_ROLES.length,
      permissionCount: PERMISSIONS.length,
      activeAssignments: assignments.filter((assignment) => assignment.active).length,
      auditLogCount: auditLogs.length,
      deniedPermissions: permissionRows.reduce((sum, row) => sum + row.permissions.filter((permission) => !permission.enabled).length, 0),
      latestHash: auditLogs[0]?.recordHash ?? "No audit hash"
    }
  };
}

export async function exportAuditLogsCsv(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.rolesCompliance, db);
  const logs = await db.complianceAuditLog.findMany({ where: { shopId }, orderBy: { sequence: "asc" }, take: 1000 });
  return [
    "timestamp,userId,role,permission,actionType,entityModel,entityId,ipAddress,userAgent,shopifySyncStatus,previousHash,recordHash",
    ...logs.map((log) =>
      [
        log.timestamp.toISOString(),
        csv(log.userId ?? ""),
        log.role ?? "",
        csv(log.permission ?? ""),
        csv(log.actionType),
        csv(log.entityModel),
        csv(log.entityId ?? ""),
        csv(log.ipAddress ?? ""),
        csv(log.userAgent ?? ""),
        log.shopifySyncStatus,
        log.previousHash ?? "",
        log.recordHash
      ].join(",")
    )
  ].join("\n");
}

export function roleLabel(role: AccessRole) {
  return role.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function verifyAuditLogIntegrity(
  logs: Array<{
    shopId: string;
    userId?: string | null;
    role?: AccessRole | null;
    permission?: string | null;
    actionType: string;
    entityModel: string;
    entityId?: string | null;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
    shopifySyncStatus: AuditSyncStatus;
    shopifySyncResult?: unknown;
    previousHash?: string | null;
    recordHash: string;
    timestamp: Date;
  }>
) {
  let previousHash: string | undefined;
  for (const log of logs) {
    if ((log.previousHash ?? undefined) !== previousHash) return false;
    const payload = {
      shopId: log.shopId,
      userId: log.userId ?? undefined,
      role: log.role ?? undefined,
      permission: log.permission ?? undefined,
      actionType: log.actionType,
      entityModel: log.entityModel,
      entityId: log.entityId ?? undefined,
      oldValue: jsonSnapshot(log.oldValue),
      newValue: jsonSnapshot(log.newValue),
      ipAddress: log.ipAddress ?? undefined,
      userAgent: log.userAgent ?? undefined,
      shopifySyncStatus: log.shopifySyncStatus,
      shopifySyncResult: jsonSnapshot(log.shopifySyncResult),
      previousHash,
      timestamp: log.timestamp.toISOString()
    };
    if (hashPayload(payload) !== log.recordHash) return false;
    previousHash = log.recordHash;
  }
  return true;
}

function hashPayload(payload: unknown) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))) as Prisma.InputJsonValue;
}

function csv(value: string) {
  return value.includes(",") || value.includes("\"") || value.includes("\n") ? `"${value.replace(/"/g, "\"\"")}"` : value;
}
