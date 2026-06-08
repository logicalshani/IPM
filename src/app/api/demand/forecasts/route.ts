import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { generateDemandForecast, recordForecastAccuracy, upsertDemandProfile } from "@/services/demandSensing.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("profile"),
    shopId: z.string(),
    productId: z.string(),
    baselineDailyDemand: z.number().optional(),
    salesVelocity30d: z.number().optional(),
    returnRate: z.number().optional(),
    activeDiscountPercent: z.number().optional(),
    merchantProxyDemand: z.number().optional(),
    restockHaloMultiplier: z.number().optional()
  }),
  z.object({
    action: z.literal("forecast"),
    shopId: z.string(),
    productId: z.string(),
    horizonDays: z.number().int().positive(),
    seasonalMultiplier: z.number().optional()
  }),
  z.object({
    action: z.literal("accuracy"),
    shopId: z.string(),
    productId: z.string(),
    month: z.coerce.date(),
    forecastDemand: z.number(),
    actualDemand: z.number()
  })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "profile") {
      const { action: _action, ...input } = body;
      return ok(await upsertDemandProfile(input), { status: 201 });
    }
    if (body.action === "accuracy") {
      const { action: _action, ...input } = body;
      return ok(await recordForecastAccuracy(input), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await generateDemandForecast(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
