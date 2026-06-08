import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, ok } from "@/lib/api";
import { queueMobileOfflineSync, syncMobileOfflinePayload } from "@/services/platformIntegration.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("queue"), shopId: z.string(), deviceId: z.string(), userId: z.string().optional(), mode: z.enum(["SCAN", "RECEIVE", "COUNT", "TRANSFERS"]), payload: z.record(z.unknown()) }),
  z.object({ action: z.literal("sync"), shopId: z.string(), syncId: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "queue") {
      const { action: _action, ...input } = body;
      return ok(await queueMobileOfflineSync({ ...input, payload: input.payload as Prisma.InputJsonValue }), { status: 201 });
    }
    return ok(await syncMobileOfflinePayload(body.shopId, body.syncId), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
