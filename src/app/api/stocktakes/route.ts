import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { createStocktakeSession } from "@/services/stocktake.service";

const createSchema = z.object({
  shopId: z.string(),
  name: z.string().min(1),
  locationId: z.string().optional(),
  assignedUserId: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  mode: z.enum(["FULL", "PARTIAL", "BLIND", "CYCLE"]),
  filters: z.record(z.unknown()).optional(),
  blindCount: z.boolean().optional()
});

export async function POST(request: Request) {
  try {
    const body = createSchema.parse(await request.json());
    const session = await createStocktakeSession({
      ...body,
      filters: body.filters as Prisma.InputJsonValue | undefined
    });
    return ok(session, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
