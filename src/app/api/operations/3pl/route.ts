import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  buildThreePLWebhookSkeleton,
  getWarehouseSyncDashboard,
  handleThreePLReceivingConfirmation,
  recordThreePLInventorySnapshot,
  upsertThreePLConnection
} from "@/services/warehouseIntegration.service";

const provider = z.enum(["SHIPBOB", "FLEXPORT", "DELIVERR", "AMAZON_FBA", "WEBHOOK"]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), shopId: z.string(), provider, name: z.string(), locationId: z.string().optional(), apiKeyRef: z.string().optional(), webhookSecret: z.string().optional() }),
  z.object({ action: z.literal("snapshot"), shopId: z.string(), productId: z.string(), provider, locationName: z.string(), externalSku: z.string(), threePLQuantity: z.number().int(), shopifyQuantity: z.number().int(), fbaFee: z.number().optional() }),
  z.object({ action: z.literal("receiving"), shopId: z.string(), productId: z.string(), locationId: z.string(), provider, quantityReceived: z.number().int().positive() }),
  z.object({ action: z.literal("dashboard"), shopId: z.string() }),
  z.object({ action: z.literal("skeleton"), provider })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "connect") {
      const { action: _action, ...input } = body;
      return ok(await upsertThreePLConnection(input), { status: 201 });
    }
    if (body.action === "snapshot") {
      const { action: _action, ...input } = body;
      return ok(await recordThreePLInventorySnapshot(input), { status: 201 });
    }
    if (body.action === "receiving") {
      const { action: _action, ...input } = body;
      return ok(await handleThreePLReceivingConfirmation(input), { status: 201 });
    }
    if (body.action === "dashboard") return ok(await getWarehouseSyncDashboard(body.shopId));
    return ok(buildThreePLWebhookSkeleton(body.provider));
  } catch (error) {
    return apiError(error);
  }
}
