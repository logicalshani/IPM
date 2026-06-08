import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  createInventoryTransfer,
  markTransferInTransit,
  receiveInventoryTransfer,
  suggestSmartTransfers,
  upsertLocationReplenishmentRule
} from "@/services/multiLocation.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest"), shopId: z.string() }),
  z.object({
    action: z.literal("create"),
    shopId: z.string(),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    costEstimate: z.number().optional(),
    lines: z.array(z.object({ productId: z.string(), sku: z.string(), quantity: z.number().int().positive() }))
  }),
  z.object({ action: z.literal("ship"), shopId: z.string(), transferId: z.string() }),
  z.object({ action: z.literal("receive"), shopId: z.string(), transferId: z.string() }),
  z.object({ action: z.literal("rule"), shopId: z.string(), productId: z.string(), locationId: z.string(), reorderPoint: z.number().int(), reorderQuantity: z.number().int(), abcClass: z.string().optional() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "suggest") return ok(await suggestSmartTransfers(body.shopId), { status: 201 });
    if (body.action === "create") {
      const { action: _action, ...input } = body;
      return ok(await createInventoryTransfer(input), { status: 201 });
    }
    if (body.action === "ship") return ok(await markTransferInTransit(body.shopId, body.transferId), { status: 201 });
    if (body.action === "receive") return ok(await receiveInventoryTransfer(body.shopId, body.transferId), { status: 201 });
    const { action: _action, ...input } = body;
    return ok(await upsertLocationReplenishmentRule(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
