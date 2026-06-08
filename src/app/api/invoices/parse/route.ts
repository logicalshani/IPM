import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { parseInvoiceTextFallback, storeParsedInvoice } from "@/services/invoiceParser.service";

const extractedSchema = z.object({
  supplierName: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  total: z.number(),
  lines: z.array(
    z.object({
      sku: z.string(),
      description: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number(),
      total: z.number()
    })
  )
});

const jsonSchema = z.object({
  shopId: z.string(),
  purchaseOrderId: z.string().optional(),
  sourceFileName: z.string().optional(),
  contractText: z.string().optional(),
  extracted: extractedSchema.optional()
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const text = form.get("text");
      const rawText = typeof text === "string" ? text : file instanceof File ? await file.text().catch(() => "") : "";
      const extracted = parseInvoiceTextFallback(rawText);
      return ok(
        await storeParsedInvoice({
          shopId: String(form.get("shopId")),
          purchaseOrderId: typeof form.get("purchaseOrderId") === "string" ? String(form.get("purchaseOrderId")) : undefined,
          sourceFileName: file instanceof File ? file.name : undefined,
          extracted
        }),
        { status: 201 }
      );
    }

    const body = jsonSchema.parse(await request.json());
    return ok(
      await storeParsedInvoice({
        shopId: body.shopId,
        purchaseOrderId: body.purchaseOrderId,
        sourceFileName: body.sourceFileName,
        extracted: body.extracted ?? parseInvoiceTextFallback(body.contractText ?? "")
      }),
      { status: 201 }
    );
  } catch (error) {
    return apiError(error);
  }
}
