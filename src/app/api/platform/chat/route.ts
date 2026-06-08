import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { connectChatWorkspace, handleChatCommand, postDailyInventoryDigest, postRealtimeStockAlert } from "@/services/platformIntegration.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), shopId: z.string(), provider: z.enum(["SLACK", "MICROSOFT_TEAMS"]), workspaceId: z.string().optional(), channelId: z.string(), channelName: z.string(), botTokenRef: z.string().optional() }),
  z.object({ action: z.literal("digest"), shopId: z.string() }),
  z.object({ action: z.literal("alert"), shopId: z.string(), provider: z.enum(["SLACK", "MICROSOFT_TEAMS"]), sku: z.string(), quantity: z.number().int(), channelId: z.string().optional() }),
  z.object({ action: z.literal("command"), shopId: z.string(), provider: z.enum(["SLACK", "MICROSOFT_TEAMS"]), command: z.string() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "connect") {
      const { action: _action, ...input } = body;
      return ok(await connectChatWorkspace(input), { status: 201 });
    }
    if (body.action === "digest") return ok(await postDailyInventoryDigest(body.shopId), { status: 201 });
    if (body.action === "alert") {
      const { action: _action, ...input } = body;
      return ok(await postRealtimeStockAlert(input), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await handleChatCommand(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
