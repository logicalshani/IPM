import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { upsertLeadTimeProfile } from "@/services/supplierLeadTime.service";

const schema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  category: z.string(),
  minimumDays: z.number().int().nonnegative(),
  maximumDays: z.number().int().nonnegative(),
  averageDays: z.number().nonnegative(),
  bufferDays: z.number().int().nonnegative().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await upsertLeadTimeProfile(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
