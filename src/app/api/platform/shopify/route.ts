import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiError, ok } from "@/lib/api";
import { emitShopifyFlowEvent, handlePosAdjustment, syncShopifyMetafields } from "@/services/platformIntegration.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("metafields"), shopId: z.string(), productId: z.string(), reorderPoint: z.number().int(), leadTimeDays: z.number().int(), abcClass: z.string() }),
  z.object({ action: z.literal("flow_event"), shopId: z.string(), eventName: z.string(), payload: z.record(z.unknown()) }),
  z.object({ action: z.literal("pos_adjustment"), shopId: z.string(), productId: z.string(), locationId: z.string(), quantityDelta: z.number().int(), posTerminalId: z.string().optional() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "metafields") {
      const { action: _action, ...input } = body;
      return ok(await syncShopifyMetafields(input), { status: 201 });
    }
    if (body.action === "flow_event") {
      const { action: _action, ...input } = body;
      return ok(await emitShopifyFlowEvent({ ...input, payload: input.payload as Prisma.InputJsonValue }), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await handlePosAdjustment(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
