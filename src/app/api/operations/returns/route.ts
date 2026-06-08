import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { getReturnAnalytics, logReturnIntake } from "@/services/returnRma.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("log"),
    shopId: z.string(),
    productId: z.string(),
    supplierId: z.string().optional(),
    orderName: z.string().optional(),
    salesChannel: z.string().optional(),
    condition: z.enum(["RESELLABLE", "DAMAGED", "DEFECTIVE", "SUPPLIER_FAULT"]),
    quantity: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
    margin: z.number()
  }),
  z.object({ action: z.literal("analytics"), shopId: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "analytics") {
      return ok(await getReturnAnalytics(body.shopId));
    }
    const { action: _action, ...input } = body;
    return ok(await logReturnIntake(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
