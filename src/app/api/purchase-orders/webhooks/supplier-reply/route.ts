import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { parseSupplierTrackingReply } from "@/services/purchaseOrder.service";

const schema = z.object({
  shopId: z.string(),
  purchaseOrderId: z.string(),
  emailBody: z.string()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await parseSupplierTrackingReply(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
