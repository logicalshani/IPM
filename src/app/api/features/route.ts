import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { FEATURE_KEYS, upsertFeature } from "@/services/feature.service";

const schema = z.object({
  shopId: z.string(),
  key: z.enum([
    FEATURE_KEYS.stocktakes,
    FEATURE_KEYS.barcodeSystem,
    FEATURE_KEYS.aiInsights,
    FEATURE_KEYS.supplierIntelligence,
    FEATURE_KEYS.supplierPricing,
    FEATURE_KEYS.supplierCommunications,
    FEATURE_KEYS.aiConsultant,
    FEATURE_KEYS.demandSensing,
    FEATURE_KEYS.invoiceParser,
    FEATURE_KEYS.profitSimulation,
    FEATURE_KEYS.competitorMonitor,
    FEATURE_KEYS.purchaseOrders,
    FEATURE_KEYS.financialIntelligence,
    FEATURE_KEYS.operationsIntelligence,
    FEATURE_KEYS.analyticsReporting,
    FEATURE_KEYS.integrationsPlatform
  ]),
  plan: z.string(),
  status: z.enum(["ENABLED", "DISABLED"]),
  config: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await upsertFeature({ ...body, config: body.config as Prisma.InputJsonValue | undefined }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
