import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { getExpiryAlerts, getFefoPickingSuggestions, recallBatch, recordBatchReceipt } from "@/services/batchLot.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("receipt"),
    shopId: z.string(),
    productId: z.string(),
    locationId: z.string(),
    batchNumber: z.string(),
    expiryDate: z.coerce.date(),
    quantityReceived: z.number().int().positive(),
    unitCost: z.number().nonnegative()
  }),
  z.object({ action: z.literal("fefo"), shopId: z.string(), productId: z.string(), quantity: z.number().int().positive() }),
  z.object({ action: z.literal("alerts"), shopId: z.string() }),
  z.object({ action: z.literal("recall"), shopId: z.string(), batchId: z.string(), reason: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "fefo") return ok(await getFefoPickingSuggestions(body));
    if (body.action === "alerts") return ok(await getExpiryAlerts(body.shopId));
    if (body.action === "recall") return ok(await recallBatch(body), { status: 201 });
    const { action: _action, ...input } = body;
    return ok(await recordBatchReceipt(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
