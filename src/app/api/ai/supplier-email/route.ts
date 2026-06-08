import { z } from "zod";
import { apiError } from "@/lib/api";
import { streamSupplierEmailDraft } from "@/services/aiSupplier.service";

const schema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  intent: z.enum(["PO_FOLLOW_UP", "DELAY_INQUIRY", "PRICE_NEGOTIATION", "INVOICE_DISPUTE", "RETURN_REQUEST"]),
  context: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const stream = await streamSupplierEmailDraft(body);
    return stream.toDataStreamResponse();
  } catch (error) {
    return apiError(error);
  }
}
