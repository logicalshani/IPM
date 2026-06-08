import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { batchGenerateProductBarcodes, generateBarcode } from "@/services/barcode.service";

const generateSchema = z.object({
  shopId: z.string(),
  productId: z.string().optional(),
  value: z.string().optional(),
  format: z.enum(["EAN_13", "CODE_128", "QR_CODE", "DATA_MATRIX"]),
  batch: z.boolean().optional(),
  category: z.string().optional(),
  supplier: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const body = generateSchema.parse(await request.json());
    if (body.batch) {
      return ok(await batchGenerateProductBarcodes(body));
    }

    if (!body.value) {
      return Response.json({ error: "value is required for single barcode generation" }, { status: 422 });
    }

    return ok(await generateBarcode({ shopId: body.shopId, productId: body.productId, value: body.value, format: body.format }), {
      status: 201
    });
  } catch (error) {
    return apiError(error);
  }
}
