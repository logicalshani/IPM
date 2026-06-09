import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import { ALL_FEATURE_KEYS, type FeatureKey, upsertFeature } from "@/services/feature.service";

const schema = z.object({
  shopId: z.string(),
  key: z.string().refine((key) => (ALL_FEATURE_KEYS as string[]).includes(key), "Unknown feature key"),
  plan: z.string(),
  status: z.enum(["ENABLED", "DISABLED"]),
  config: z.record(z.unknown()).optional()
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    return ok(await upsertFeature({ ...body, key: body.key as FeatureKey, config: body.config as Prisma.InputJsonValue | undefined }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
