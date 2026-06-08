import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { approveParsedInvoice } from "@/services/invoiceParser.service";

const schema = z.object({
  shopId: z.string(),
  invoiceId: z.string()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await approveParsedInvoice(body), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
