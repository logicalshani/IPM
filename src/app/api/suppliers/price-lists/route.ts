import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { saveSupplierPriceList } from "@/services/supplierPricing.service";

const schema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  name: z.string(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional(),
  currency: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().optional(),
      sku: z.string(),
      moq: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
      retailPrice: z.number().nonnegative().optional()
    })
  )
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await saveSupplierPriceList(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
