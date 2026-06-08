import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { createPublicApiKey, registerOutboundWebhook } from "@/services/platformIntegration.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("api_key"), shopId: z.string(), name: z.string(), plan: z.enum(["growth", "pro", "enterprise"]) }),
  z.object({ action: z.literal("webhook"), shopId: z.string(), targetUrl: z.string().url(), eventTypes: z.array(z.string()).min(1), secret: z.string().optional() })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "api_key") {
      const { action: _action, ...input } = body;
      return ok(await createPublicApiKey(input), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await registerOutboundWebhook(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
