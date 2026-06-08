import { apiError, ok } from "@/lib/api";
import { handleShopifyWebhook, verifyShopifyWebhookSignature } from "@/services/platformIntegration.service";

export async function POST(request: Request, { params }: { params: { topic: string[] } }) {
  try {
    const topic = params.topic.join("/");
    const shopId = request.headers.get("x-imp-shop-id") ?? "demo-shop";
    const shopifyWebhookId = request.headers.get("x-shopify-webhook-id") ?? undefined;
    const body = await request.text();
    if (process.env.SHOPIFY_WEBHOOK_SECRET) {
      const verified = verifyShopifyWebhookSignature(body, request.headers.get("x-shopify-hmac-sha256"), process.env.SHOPIFY_WEBHOOK_SECRET);
      if (!verified) {
        return Response.json({ error: "Invalid Shopify webhook signature" }, { status: 401 });
      }
    }
    return ok(await handleShopifyWebhook({ shopId, topic, shopifyWebhookId, payload: JSON.parse(body) }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
