import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { optimizeVolumeDiscounts } from "@/services/supplierPricing.service";

const schema = z.object({
  shopId: z.string(),
  budget: z.number().positive(),
  candidateSkus: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await optimizeVolumeDiscounts(body));
  } catch (error) {
    return apiError(error);
  }
}
