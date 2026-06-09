import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { PrismaClient } from "@prisma/client";
import { hasConfiguredAIProvider, textFallbackStream } from "@/lib/ai-fallback";
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

  if (!hasConfiguredAIProvider()) {
    const varianceCount = context.reduce((sum, session) => sum + session.lines.length, 0);
    const topVariance = context.flatMap((session) => session.lines).at(0);
    return textFallbackStream(
      [
        "| Metric | Value |",
        "| --- | --- |",
        `| Recent sessions reviewed | ${context.length} |`,
        `| Variance lines found | ${varianceCount} |`,
        `| Highest variance SKU | ${topVariance?.product?.sku ?? "No variance yet"} |`,
        "",
        "Summary: AI provider keys are not configured, so IMP returned deterministic inventory-risk guidance from the live stocktake variance context.",
        "",
        "Confidence: Medium",
        "",
        "Suggested next action: Review red variance lines, confirm physical counts, then sync only approved adjustments."
      ].join("\n")
    );
  }

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
