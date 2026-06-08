import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  exportShrinkageTaxCsv,
  getMonthlyShrinkageReport,
  recordInventoryAdjustment
} from "@/services/financialIntelligence.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjustment"),
    shopId: z.string(),
    productId: z.string(),
    locationId: z.string().optional(),
    userId: z.string().optional(),
    reason: z.enum(["DAMAGED", "STOLEN", "EXPIRED", "DATA_ERROR", "CORRECTION"]),
    quantity: z.number().int().positive(),
    unitCost: z.number().nonnegative(),
    note: z.string().optional()
  }),
  z.object({ action: z.literal("report"), shopId: z.string(), month: z.coerce.date().optional() }),
  z.object({ action: z.literal("export"), shopId: z.string(), month: z.coerce.date().optional() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "adjustment") {
      const { action: _action, ...input } = body;
      return ok(await recordInventoryAdjustment(input), { status: 201 });
    }
    if (body.action === "export") {
      const csv = await exportShrinkageTaxCsv(body.shopId, body.month ?? new Date());
      return new Response(csv, {
        headers: {
          "content-type": "text/csv",
          "content-disposition": "attachment; filename=shrinkage-tax-export.csv"
        }
      });
    }
    return ok(await getMonthlyShrinkageReport(body.shopId, body.month ?? new Date()));
  } catch (error) {
    return apiError(error);
  }
}
