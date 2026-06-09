import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { PrismaClient, SupplierEmailIntent } from "@prisma/client";
import { hasConfiguredAIProvider, textFallbackStream } from "@/lib/ai-fallback";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function streamSupplierInsight(
  input: { shopId: string; prompt: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.aiInsights, db);

  const suppliers = await db.supplier.findMany({
    where: { shopId: input.shopId },
    include: {
      leadTimes: true,
      purchaseOrders: { include: { lines: true }, orderBy: { orderedAt: "desc" }, take: 10 },
      contracts: { orderBy: { renewalDate: "asc" }, take: 5 }
    },
    orderBy: { reliabilityScore: "asc" },
    take: 20
  });

  return streamWithFallback(
    "You are Inventory Manager Pro's supplier intelligence analyst. Explain supplier risk, replacement choices, pricing exposure, and next actions with concise operational detail.",
    `${input.prompt}\n\nSupplier context:\n${JSON.stringify(suppliers)}`
  );
}

export async function streamSupplierEmailDraft(
  input: {
    shopId: string;
    supplierId: string;
    intent: SupplierEmailIntent;
    context?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierCommunications, db);

  const supplier = await db.supplier.findUniqueOrThrow({
    where: { id: input.supplierId, shopId: input.shopId },
    include: { purchaseOrders: { include: { lines: true }, orderBy: { orderedAt: "desc" }, take: 5 } }
  });

  return streamWithFallback(
    "Draft supplier emails for inventory operators. Write a clear subject line and short body. Be firm, specific, and commercially polite.",
    `Intent: ${input.intent}\nContext: ${input.context ?? "No extra context"}\nSupplier:\n${JSON.stringify(supplier)}`
  );
}

export async function streamContractSummary(
  input: {
    shopId: string;
    supplierId: string;
    fileName?: string;
    contractText: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierPricing, db);

  return streamWithFallback(
    "Extract supplier contract terms into structured, merchant-friendly notes. Include payment terms, MOQ, lead-time commitment, return policy, exclusivity clauses, renewal dates, and risks.",
    `File: ${input.fileName ?? "uploaded contract"}\nContract text:\n${input.contractText.slice(0, 40_000)}`
  );
}

export async function getReplacementSupplierSuggestions(
  shopId: string,
  supplierId: string,
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  const supplier = await db.supplier.findUniqueOrThrow({
    where: { id: supplierId, shopId },
    include: { leadTimes: true }
  });
  const categories = supplier.leadTimes.map((leadTime) => leadTime.category);
  const alternatives = await db.supplier.findMany({
    where: {
      shopId,
      id: { not: supplierId },
      reliabilityScore: { gte: 60 },
      leadTimes: categories.length ? { some: { category: { in: categories } } } : undefined
    },
    include: { leadTimes: true },
    orderBy: { reliabilityScore: "desc" },
    take: 5
  });

  return {
    supplier,
    alternatives,
    needsNewSupplierSearch: Number(supplier.reliabilityScore) < 60 && alternatives.length === 0
  };
}

function streamWithFallback(system: string, user: string) {
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user }
  ];

  if (!hasConfiguredAIProvider()) {
    return textFallbackStream(
      [
        "| Section | Detail |",
        "| --- | --- |",
        "| Mode | Deterministic supplier intelligence fallback |",
        "| Source | Live IMP supplier, PO, lead-time, and contract context |",
        "",
        "Summary: AI provider keys are not configured, so IMP returned a structured operational draft from the available supplier context instead of calling an external model.",
        "",
        "Recommended response:",
        user.slice(0, 1200),
        "",
        "Confidence: Medium",
        "",
        "Suggested next action: Review the supplier evidence, edit the message if needed, then log or send it from the supplier thread."
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
