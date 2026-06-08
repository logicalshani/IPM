import { z } from "zod";
import { apiError } from "@/lib/api";
import { streamContractSummary } from "@/services/aiSupplier.service";

const jsonSchema = z.object({
  shopId: z.string(),
  supplierId: z.string(),
  fileName: z.string().optional(),
  contractText: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const contractText = form.get("contractText");
      const body = jsonSchema.parse({
        shopId: form.get("shopId"),
        supplierId: form.get("supplierId"),
        fileName: file instanceof File ? file.name : undefined,
        contractText: typeof contractText === "string" && contractText.length > 0 ? contractText : file instanceof File ? await file.text() : ""
      });
      const stream = await streamContractSummary(body);
      return stream.toDataStreamResponse();
    }

    const body = jsonSchema.parse(await request.json());
    const stream = await streamContractSummary(body);
    return stream.toDataStreamResponse();
  } catch (error) {
    return apiError(error);
  }
}
