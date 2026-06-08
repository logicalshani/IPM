import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { addCompetitorProduct, enqueueWeeklyCompetitorScrape, recordCompetitorPrice } from "@/services/competitorMonitor.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    shopId: z.string(),
    productId: z.string(),
    competitorName: z.string(),
    url: z.string().url()
  }),
  z.object({
    action: z.literal("snapshot"),
    shopId: z.string(),
    competitorProductId: z.string(),
    observedPrice: z.number().positive()
  }),
  z.object({
    action: z.literal("enqueue"),
    shopId: z.string()
  })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "add") {
      const { action: _action, ...input } = body;
      return ok(await addCompetitorProduct(input), { status: 201 });
    }
    if (body.action === "snapshot") {
      const { action: _action, ...input } = body;
      return ok(await recordCompetitorPrice(input), { status: 201 });
    }
    return ok(await enqueueWeeklyCompetitorScrape(body.shopId));
  } catch (error) {
    return apiError(error);
  }
}
