import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  createPurchaseOrderDraft,
  enqueueNightlyPurchaseOrderDrafts,
  generateNightlyPurchaseOrderDrafts
} from "@/services/purchaseOrder.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    shopId: z.string(),
    supplierId: z.string(),
    poNumber: z.string().optional(),
    notes: z.string().optional(),
    lines: z.array(
      z.object({
        productId: z.string().optional(),
        sku: z.string(),
        category: z.string(),
        orderedQuantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative()
      })
    ).min(1)
  }),
  z.object({ action: z.literal("generate_auto_drafts"), shopId: z.string() }),
  z.object({ action: z.literal("enqueue_auto_drafts"), shopId: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "create") {
      const { action: _action, ...input } = body;
      return ok(await createPurchaseOrderDraft(input), { status: 201 });
    }
    if (body.action === "generate_auto_drafts") {
      return ok(await generateNightlyPurchaseOrderDrafts(body.shopId), { status: 201 });
    }
    return ok(await enqueueNightlyPurchaseOrderDrafts(body.shopId));
  } catch (error) {
    return apiError(error);
  }
}
