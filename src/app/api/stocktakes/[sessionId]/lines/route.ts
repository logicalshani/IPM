import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { countStocktakeLine } from "@/services/stocktake.service";

const countSchema = z.object({
  shopId: z.string(),
  productId: z.string(),
  countedQuantity: z.number().int().min(0),
  countSource: z.enum(["barcode", "manual", "csv", "split"])
});

export async function POST(request: Request, { params }: { params: { sessionId: string } }) {
  try {
    const body = countSchema.parse(await request.json());
    const line = await countStocktakeLine({ ...body, sessionId: params.sessionId });
    return ok(line);
  } catch (error) {
    return apiError(error);
  }
}
