import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  pinAIInsight,
  rememberAIContext,
  suggestCrossStoreTransfers,
  upsertManagedStore,
  upsertWhiteLabelProfile
} from "@/services/platformInfrastructure.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("white_label"),
    shopId: z.string(),
    agencyName: z.string().min(1),
    brandName: z.string().min(1),
    supportEmail: z.string().email(),
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    customDomain: z.string().optional(),
    emailFromName: z.string().optional(),
    pdfFooterText: z.string().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED"]).optional()
  }),
  z.object({
    action: z.literal("managed_store"),
    shopId: z.string(),
    shopifyDomain: z.string().min(1),
    name: z.string().min(1),
    currency: z.string().optional(),
    status: z.enum(["CONNECTED", "SYNCING", "DISCONNECTED", "ERROR"]).optional(),
    inventoryEfficiencyScore: z.number().min(0).max(100).optional(),
    revenue30d: z.number().min(0).optional(),
    inventoryValue: z.number().min(0).optional(),
    unitsOnHand: z.number().int().min(0).optional()
  }),
  z.object({ action: z.literal("suggest_transfers"), shopId: z.string() }),
  z.object({
    action: z.literal("remember_ai"),
    shopId: z.string(),
    userId: z.string().optional(),
    question: z.string().min(1),
    sku: z.string().optional(),
    productId: z.string().optional(),
    topic: z.string().optional(),
    summary: z.string().optional()
  }),
  z.object({
    action: z.literal("pin_insight"),
    shopId: z.string(),
    sessionId: z.string().optional(),
    title: z.string().min(1),
    insight: z.string().min(1),
    sourceQuestion: z.string().optional(),
    confidence: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdBy: z.string().optional()
  })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "white_label") {
      const { action: _action, ...input } = body;
      return ok(await upsertWhiteLabelProfile(input), { status: 201 });
    }
    if (body.action === "managed_store") {
      const { action: _action, ...input } = body;
      return ok(await upsertManagedStore(input), { status: 201 });
    }
    if (body.action === "suggest_transfers") return ok(await suggestCrossStoreTransfers(body.shopId), { status: 201 });
    if (body.action === "remember_ai") {
      const { action: _action, ...input } = body;
      return ok(await rememberAIContext(input), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await pinAIInsight(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
