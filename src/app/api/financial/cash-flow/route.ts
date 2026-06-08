import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  getFinancialDashboard,
  projectInventoryCashFlow,
  upsertFinancialSettings
} from "@/services/financialIntelligence.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dashboard"), shopId: z.string() }),
  z.object({ action: z.literal("project"), shopId: z.string() }),
  z.object({
    action: z.literal("settings"),
    shopId: z.string(),
    valuationMethod: z.enum(["FIFO", "LIFO", "WEIGHTED_AVERAGE"]).optional(),
    workingCapitalThreshold: z.number().optional(),
    industryDioBenchmark: z.number().optional(),
    industryDsoBenchmark: z.number().optional(),
    industryDpoBenchmark: z.number().optional(),
    defaultDsoDays: z.number().int().nonnegative().optional()
  })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "dashboard") {
      return ok(await getFinancialDashboard(body.shopId));
    }
    if (body.action === "project") {
      return ok(await projectInventoryCashFlow(body.shopId));
    }
    const { action: _action, ...input } = body;
    return ok(await upsertFinancialSettings(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
