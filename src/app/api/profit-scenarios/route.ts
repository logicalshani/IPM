import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { saveProfitScenario } from "@/services/profitSimulation.service";

const optionSchema = z.object({
  productId: z.string().optional(),
  supplierName: z.string(),
  label: z.string(),
  orderQuantity: z.number().int().positive(),
  supplierPrice: z.number().positive(),
  sellingPrice: z.number().positive(),
  expectedSellThrough: z.number().min(0).max(1),
  timeframeDays: z.number().int().positive(),
  runMonteCarlo: z.boolean().optional()
});

const schema = z.object({
  shopId: z.string(),
  name: z.string(),
  timeframeDays: z.number().int().positive(),
  budget: z.number().optional(),
  notes: z.string().optional(),
  options: z.array(optionSchema).min(1)
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await saveProfitScenario(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
