import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { ingestDemandSignal, ingestGoogleTrendsSignal } from "@/services/demandSensing.service";

const schema = z.object({
  shopId: z.string(),
  productId: z.string().optional(),
  keyword: z.string(),
  type: z.enum(["GOOGLE_TRENDS", "SHOPIFY_DISCOUNT", "RETURN_RATE", "SEASONALITY", "RESTOCK_HALO", "MERCHANT_PROXY"]),
  score: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.type === "GOOGLE_TRENDS") {
      return ok(await ingestGoogleTrendsSignal({ ...body, trendScore: body.score }), { status: 201 });
    }
    return ok(
      await ingestDemandSignal({
        ...body,
        score: body.score ?? 0,
        metadata: body.metadata as Prisma.InputJsonValue | undefined
      }),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
