import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { saveBarcodeTemplate } from "@/services/barcode.service";

const templateSchema = z.object({
  shopId: z.string(),
  name: z.string().min(1),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  fields: z.array(z.record(z.unknown()))
});

export async function POST(request: Request) {
  try {
    const body = templateSchema.parse(await request.json());
    return ok(await saveBarcodeTemplate({ ...body, fields: body.fields as Prisma.InputJsonValue }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
