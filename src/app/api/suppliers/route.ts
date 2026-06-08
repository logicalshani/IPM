import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { upsertSupplier } from "@/services/supplierLeadTime.service";

const schema = z.object({
  shopId: z.string(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  defaultCurrency: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await upsertSupplier(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
