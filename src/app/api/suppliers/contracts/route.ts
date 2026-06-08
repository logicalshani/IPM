import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { saveSupplierContract } from "@/services/supplierPricing.service";

const schema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  title: z.string(),
  effectiveDate: z.coerce.date().optional(),
  renewalDate: z.coerce.date().optional(),
  paymentTerms: z.string().optional(),
  moqTerms: z.string().optional(),
  leadTimeCommitment: z.string().optional(),
  returnPolicy: z.string().optional(),
  exclusivityClauses: z.string().optional(),
  aiSummary: z.string().optional(),
  sourceFileName: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await saveSupplierContract(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
