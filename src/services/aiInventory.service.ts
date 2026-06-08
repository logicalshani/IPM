import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function streamInventoryInsights(
  input: { shopId: string; prompt: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.aiInsights, db);

  const context = await db.stocktakeSession.findMany({
    where: { shopId: input.shopId },
    include: {
      lines: {
        include: { product: true },
        where: { varianceUnits: { not: 0 } },
        take: 25,
        orderBy: { varianceValue: "desc" }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 5
  });

  const messages = [
    {
      role: "system" as const,
      content:
        "You are Inventory Manager Pro's operations analyst. Give concise, numeric, actionable inventory recommendations. Focus on shrinkage, count quality, and Shopify reconciliation risk."
    },
    {
      role: "user" as const,
      content: `${input.prompt}\n\nRecent stocktake variance context:\n${JSON.stringify(context)}`
    }
  ];

  try {
    return streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      messages
    });
  } catch {
    return streamText({
      model: openai("gpt-4o"),
      messages
    });
  }
}
