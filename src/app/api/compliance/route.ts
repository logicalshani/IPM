import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  ACCESS_ROLES,
  PERMISSIONS,
  assignUserRole,
  exportAuditLogsCsv,
  recordAuditLog,
  seedDefaultRolePermissions,
  updateRolePermission
} from "@/services/compliance.service";

const roleSchema = z.enum(ACCESS_ROLES);
const permissionSchema = z.enum(PERMISSIONS);

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seed_permissions"), shopId: z.string() }),
  z.object({
    action: z.literal("assign_role"),
    shopId: z.string(),
    userId: z.string(),
    role: roleSchema,
    assignedBy: z.string().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional()
  }),
  z.object({
    action: z.literal("permission"),
    shopId: z.string(),
    role: roleSchema,
    permission: permissionSchema,
    enabled: z.boolean(),
    actorUserId: z.string().optional(),
    actorRole: roleSchema.optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional()
  }),
  z.object({
    action: z.literal("audit"),
    shopId: z.string(),
    userId: z.string().optional(),
    role: roleSchema.optional(),
    permission: z.string().optional(),
    actionType: z.string(),
    entityModel: z.string(),
    entityId: z.string().optional(),
    oldValue: z.unknown().optional(),
    newValue: z.unknown().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    shopifySyncStatus: z.enum(["NOT_SYNCED", "SUCCESS", "FAILED", "PENDING"]).optional(),
    shopifySyncResult: z.unknown().optional()
  }),
  z.object({ action: z.literal("export_audit"), shopId: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "seed_permissions") return ok(await seedDefaultRolePermissions(body.shopId), { status: 201 });
    if (body.action === "assign_role") {
      const { action: _action, ...input } = body;
      return ok(await assignUserRole(input), { status: 201 });
    }
    if (body.action === "permission") {
      const { action: _action, ...input } = body;
      return ok(await updateRolePermission(input), { status: 201 });
    }
    if (body.action === "audit") {
      const { action: _action, ...input } = body;
      return ok(await recordAuditLog(input), { status: 201 });
    }

    const csv = await exportAuditLogsCsv(body.shopId);
    return new NextResponse(csv, {
      headers: {
        "Content-Disposition": "attachment; filename=imp-audit-log.csv",
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
