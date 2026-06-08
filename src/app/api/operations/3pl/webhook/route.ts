import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { recordThreePLInventorySnapshot } from "@/services/warehouseIntegration.service";

const schema = z.object({
  shopId: z.string(),
  productId: z.string(),
  provider: z.enum(["SHIPBOB", "FLEXPORT", "DELIVERR", "AMAZON_FBA", "WEBHOOK"]),
  locationName: z.string(),
  externalSku: z.string(),
  threePLQuantity: z.number().int(),
  shopifyQuantity: z.number().int(),
  fbaFee: z.number().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await recordThreePLInventorySnapshot(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
