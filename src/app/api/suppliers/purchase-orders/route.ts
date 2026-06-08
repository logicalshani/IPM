import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { recordPurchaseOrderEvidence } from "@/services/supplierLeadTime.service";

const schema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  poNumber: z.string(),
  orderedAt: z.coerce.date().optional(),
  promisedDeliveryDate: z.coerce.date().optional(),
  actualDeliveryDate: z.coerce.date().optional(),
  invoiceAccurate: z.boolean().optional(),
  invoiceTotal: z.number().optional(),
  expectedTotal: z.number().optional(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().optional(),
      sku: z.string(),
      category: z.string(),
      orderedQuantity: z.number().int().positive(),
      receivedQuantity: z.number().int().nonnegative(),
      unitPrice: z.number().nonnegative(),
      invoiceUnitPrice: z.number().nonnegative().optional()
    })
  )
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await recordPurchaseOrderEvidence(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
