import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";
import { rememberAIContext } from "./platformInfrastructure.service";

type SnapshotProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  supplierName: string;
  quantityOnHand: number;
  price: number;
  cost: number;
  inventoryValue: number;
  grossMargin: number;
  dailyDemand: number;
  daysOfStockLeft: number;
  daysSinceLastSale: number | null;
  returnRate: number;
  expiryDate: string | null;
  leadTimeDays: number;
};

type InventorySnapshot = {
  products: SnapshotProduct[];
  suppliers: Array<{
    id: string;
    name: string;
    reliabilityScore: number;
    onTimeRate: number;
    fillRate: number;
    invoiceAccuracy: number;
    latePOs: Array<{ poNumber: string; delayDays: number; fillRate: number }>;
  }>;
  generatedAt: string;
};

export async function createAIConsultation(
  input: { shopId: string; userId?: string; question: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.aiConsultant, db);

  const snapshot = await buildInventorySnapshot(input.shopId, db);
  const intent = classifyConsultantIntent(input.question);
  const deterministic = answerFromSnapshot(intent, input.question, snapshot);
  const memory = await getConsultantMemory(input.shopId, input.userId, db);

  const session = await db.aIConsultationSession.create({
    data: {
      shopId: input.shopId,
      userId: input.userId,
      question: input.question,
      dataSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      intent,
      confidence: deterministic.confidence,
      suggestedAction: deterministic.suggestedAction
    }
  });

  await rememberAIContext(
    {
      shopId: input.shopId,
      userId: input.userId,
      question: input.question,
      sku: extractSku(input.question) ?? undefined,
      topic: intent,
      summary: deterministic.summary
    },
    db
  ).catch(() => undefined);

  const messages = [
    {
      role: "system" as const,
      content:
        "You are Inventory Manager Pro's AI Inventory Consultant. Every answer must use only the provided app data snapshot and the supplied AI memory context. Always include a markdown data table, plain-language summary, confidence level (High/Medium/Low), reasoning with numbers, and a final suggested next action button label. Do not act like a generic chatbot."
    },
    {
      role: "user" as const,
      content: `Question: ${input.question}\nIntent: ${intent}\nAI memory context:\n${JSON.stringify(memory)}\nDeterministic analysis seed:\n${JSON.stringify(deterministic)}\nApp data snapshot:\n${JSON.stringify(snapshot)}`
    }
  ];

  const onFinish = async ({ text }: { text: string }) => {
    await db.aIConsultationSession.update({
      where: { id: session.id },
      data: { answer: text }
    });
  };

  try {
    return {
      sessionId: session.id,
      analysis: deterministic,
      stream: streamText({ model: anthropic("claude-sonnet-4-20250514"), messages, onFinish })
    };
  } catch {
    return {
      sessionId: session.id,
      analysis: deterministic,
      stream: streamText({ model: openai("gpt-4o"), messages, onFinish })
    };
  }
}

export async function recordAIConsultationFeedback(
  input: { shopId: string; sessionId: string; feedback: "THUMBS_UP" | "THUMBS_DOWN"; feedbackNote?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.aiConsultant, db);

  return db.aIConsultationSession.update({
    where: { id: input.sessionId, shopId: input.shopId },
    data: { feedback: input.feedback, feedbackNote: input.feedbackNote }
  });
}

export async function getAIConsultationHistory(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.aiConsultant, db);

  return db.aIConsultationSession.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 25
  });
}

export async function buildInventorySnapshot(shopId: string, db: PrismaClient = prisma): Promise<InventorySnapshot> {
  const [products, suppliers] = await Promise.all([
    db.product.findMany({
      where: { shopId },
      include: {
        inventory: true,
        demandProfile: true,
        supplierRecord: { include: { leadTimes: true } },
        movements: { where: { occurredAt: { gte: daysAgo(180) } }, orderBy: { occurredAt: "desc" } }
      },
      orderBy: { sku: "asc" }
    }),
    db.supplier.findMany({
      where: { shopId },
      include: { purchaseOrders: { include: { lines: true }, orderBy: { orderedAt: "desc" }, take: 10 } },
      orderBy: { reliabilityScore: "asc" }
    })
  ]);

  return {
    generatedAt: new Date().toISOString(),
    products: products.map((product) => {
      const quantityOnHand = product.inventory.reduce((sum, row) => sum + row.quantity, 0);
      const sales30d = product.movements
        .filter((movement) => movement.type === "SALE" && movement.occurredAt >= daysAgo(30))
        .reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
      const dailyDemand = Number(product.demandProfile?.baselineDailyDemand ?? 0) || sales30d / 30 || Number(product.demandProfile?.merchantProxyDemand ?? 0) || 0.1;
      const leadTime = product.supplierRecord?.leadTimes.find((leadTime) => leadTime.category === product.category);
      const lastSale = product.movements.find((movement) => movement.type === "SALE")?.occurredAt ?? product.demandProfile?.lastSaleAt ?? null;

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category ?? "Uncategorized",
        supplierName: product.supplierRecord?.name ?? product.supplier ?? "Unassigned",
        quantityOnHand,
        price: Number(product.price),
        cost: Number(product.cost),
        inventoryValue: round(quantityOnHand * Number(product.cost)),
        grossMargin: round(Number(product.price) - Number(product.cost)),
        dailyDemand: round(dailyDemand),
        daysOfStockLeft: round(quantityOnHand / Math.max(dailyDemand, 0.1)),
        daysSinceLastSale: lastSale ? Math.max(0, Math.round((Date.now() - lastSale.getTime()) / 86_400_000)) : null,
        returnRate: Number(product.demandProfile?.returnRate ?? 0),
        expiryDate: product.expiryDate?.toISOString() ?? null,
        leadTimeDays: Number(leadTime?.dynamicEstimateDays ?? leadTime?.averageDays ?? 14)
      };
    }),
    suppliers: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      reliabilityScore: Number(supplier.reliabilityScore),
      onTimeRate: Number(supplier.onTimeRate),
      fillRate: Number(supplier.fillRate),
      invoiceAccuracy: Number(supplier.invoiceAccuracy),
      latePOs: supplier.purchaseOrders
        .filter((po) => (po.deliveryDeltaDays ?? 0) > 0)
        .map((po) => {
          const ordered = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
          const received = po.lines.reduce((sum, line) => sum + line.receivedQuantity, 0);
          return {
            poNumber: po.poNumber,
            delayDays: po.deliveryDeltaDays ?? 0,
            fillRate: ordered === 0 ? 0 : round((received / ordered) * 100)
          };
        })
    }))
  };
}

export function classifyConsultantIntent(question: string) {
  const normalized = question.toLowerCase();
  if (normalized.includes("5,000") || normalized.includes("5000") || normalized.includes("budget")) return "budget_optimization";
  if (normalized.includes("cash flow")) return "cash_flow";
  if (normalized.includes("unreliable supplier")) return "supplier_reliability";
  if (normalized.includes("30 days") && normalized.includes("reorder nothing")) return "inventory_value_simulation";
  if (normalized.includes("sale") || normalized.includes("weekend")) return "sale_candidates";
  if (normalized.includes("black friday")) return "seasonal_stockout_risk";
  if (normalized.includes("inventory value up") || normalized.includes("revenue down")) return "value_revenue_correlation";
  return "weekly_reorder";
}

export function answerFromSnapshot(intent: string, question: string, snapshot: InventorySnapshot) {
  if (intent === "budget_optimization") {
    return optimizeBudgetPurchases(snapshot, extractBudget(question) ?? 5000);
  }
  if (intent === "cash_flow") return identifyCashFlowKillers(snapshot);
  if (intent === "supplier_reliability") return rankUnreliableSuppliers(snapshot);
  if (intent === "inventory_value_simulation") return simulateInventoryValue(snapshot, 30);
  if (intent === "sale_candidates") return selectSaleCandidates(snapshot);
  if (intent === "seasonal_stockout_risk") return blackFridayStockoutRisk(snapshot);
  if (intent === "value_revenue_correlation") return inventoryValueRevenueCorrelation(snapshot);
  return calculateReorderRecommendations(snapshot);
}

export function calculateReorderRecommendations(snapshot: InventorySnapshot) {
  const rows = snapshot.products
    .map((product) => {
      const targetDays = product.leadTimeDays + 14;
      const reorderQty = Math.max(0, Math.ceil(targetDays * product.dailyDemand - product.quantityOnHand));
      return {
        SKU: product.sku,
        "Days left": product.daysOfStockLeft,
        "Reorder qty": reorderQty,
        Supplier: product.supplierName,
        "Estimated cost": round(reorderQty * product.cost),
        "Profit impact": round(reorderQty * product.grossMargin)
      };
    })
    .filter((row) => row["Reorder qty"] > 0)
    .sort((a, b) => a["Days left"] - b["Days left"]);

  return {
    table: rows,
    summary: rows.length ? `${rows.length} SKUs need reorder coverage inside supplier lead time plus safety stock.` : "No immediate reorder pressure detected.",
    confidence: snapshot.products.length >= 5 ? "High" : "Medium",
    suggestedAction: "Create prioritized POs"
  };
}

export function optimizeBudgetPurchases(snapshot: InventorySnapshot, budget: number) {
  let remaining = budget;
  const candidates = calculateReorderRecommendations(snapshot).table
    .map((row) => ({
      ...row,
      score: Number(row["Profit impact"]) / Math.max(Number(row["Estimated cost"]), 1)
    }))
    .sort((a, b) => b.score - a.score);
  const table = [];
  for (const candidate of candidates) {
    const cost = Number(candidate["Estimated cost"]);
    if (cost <= remaining) {
      table.push(candidate);
      remaining -= cost;
    }
  }
  return {
    table,
    summary: `Allocated $${round(budget - remaining)} of $${budget} toward the highest profit contribution per dollar.`,
    confidence: table.length ? "Medium" : "Low",
    suggestedAction: "Build budget-constrained PO"
  };
}

export function identifyCashFlowKillers(snapshot: InventorySnapshot) {
  const table = snapshot.products
    .map((product) => ({
      SKU: product.sku,
      "Capital locked": product.inventoryValue,
      "Days since sale": product.daysSinceLastSale ?? 999,
      "Days left": product.daysOfStockLeft,
      "Liquidation option": product.grossMargin > product.cost * 0.3 ? "Weekend markdown" : "Bundle with faster mover"
    }))
    .filter((row) => row["Capital locked"] > 100 && row["Days since sale"] > 45)
    .sort((a, b) => b["Capital locked"] - a["Capital locked"]);
  return {
    table,
    summary: `${table.length} SKUs have meaningful capital locked with weak recent movement.`,
    confidence: "Medium",
    suggestedAction: "Create liquidation plan"
  };
}

export function rankUnreliableSuppliers(snapshot: InventorySnapshot) {
  const table = snapshot.suppliers
    .map((supplier) => ({
      Supplier: supplier.name,
      Score: supplier.reliabilityScore,
      "On-time": `${supplier.onTimeRate}%`,
      "Fill rate": `${supplier.fillRate}%`,
      "Invoice accuracy": `${supplier.invoiceAccuracy}%`,
      Evidence: supplier.latePOs.map((po) => `${po.poNumber}: ${po.delayDays}d late, ${po.fillRate}% fill`).join("; ") || "No late PO evidence"
    }))
    .sort((a, b) => a.Score - b.Score);
  return {
    table,
    summary: table[0] ? `${table[0].Supplier} is the highest-risk supplier by composite reliability score.` : "No supplier score evidence available.",
    confidence: snapshot.suppliers.length >= 3 ? "High" : "Medium",
    suggestedAction: "Review supplier replacement"
  };
}

export function simulateInventoryValue(snapshot: InventorySnapshot, days: number) {
  const table = snapshot.products.map((product) => {
    const projectedUnits = Math.max(0, product.quantityOnHand - product.dailyDemand * days);
    return {
      SKU: product.sku,
      "Current value": product.inventoryValue,
      "Projected units": round(projectedUnits),
      "Projected value": round(projectedUnits * product.cost),
      "Value change": round(projectedUnits * product.cost - product.inventoryValue)
    };
  });
  return {
    table,
    summary: `If no reorders are placed, inventory value projects to $${round(table.reduce((sum, row) => sum + Number(row["Projected value"]), 0))} in ${days} days.`,
    confidence: "Medium",
    suggestedAction: "Run reorder simulation"
  };
}

export function selectSaleCandidates(snapshot: InventorySnapshot) {
  const table = snapshot.products
    .filter((product) => product.daysOfStockLeft > 90 || (product.expiryDate && new Date(product.expiryDate) < daysFromNow(45)))
    .map((product) => ({
      SKU: product.sku,
      "Days left": product.daysOfStockLeft,
      "Margin headroom": product.grossMargin,
      "Return rate": `${product.returnRate}%`,
      Recommendation: product.expiryDate ? "Expiry markdown" : "Weekend sale"
    }));
  return {
    table,
    summary: `${table.length} SKUs have overstock, dead-stock, expiry, or margin-headroom reasons to discount.`,
    confidence: "Medium",
    suggestedAction: "Create sale list"
  };
}

export function blackFridayStockoutRisk(snapshot: InventorySnapshot) {
  const multiplier = 2.4;
  const table = snapshot.products.map((product) => {
    const bfDemand = product.dailyDemand * multiplier * 14;
    return {
      SKU: product.sku,
      "BF demand": round(bfDemand),
      "On hand": product.quantityOnHand,
      "Lead time": product.leadTimeDays,
      Risk: product.quantityOnHand < bfDemand + product.leadTimeDays * product.dailyDemand ? "High" : "Low"
    };
  });
  return {
    table,
    summary: "Black Friday risk uses a seasonal demand multiplier against current stock and supplier lead times.",
    confidence: "Low",
    suggestedAction: "Set seasonal demand inputs"
  };
}

export function inventoryValueRevenueCorrelation(snapshot: InventorySnapshot) {
  const table = snapshot.products
    .map((product) => ({
      SKU: product.sku,
      "Inventory value": product.inventoryValue,
      "Daily demand": product.dailyDemand,
      "Days left": product.daysOfStockLeft,
      Diagnosis: product.inventoryValue > 500 && product.dailyDemand < 1 ? "Accumulating faster than selling" : "Normal"
    }))
    .sort((a, b) => b["Inventory value"] - a["Inventory value"]);
  return {
    table,
    summary: "Revenue can fall while inventory value rises when high-value SKUs accumulate without matching sales velocity.",
    confidence: "Medium",
    suggestedAction: "Audit accumulating SKUs"
  };
}

function extractBudget(question: string) {
  const match = question.replaceAll(",", "").match(/\$?(\d{3,})/);
  return match ? Number(match[1]) : null;
}

async function getConsultantMemory(shopId: string, userId: string | undefined, db: PrismaClient) {
  try {
    const [recentSessions, rememberedTopics, pinnedInsights] = await Promise.all([
      db.aIConsultationSession.findMany({
        where: { shopId, ...(userId ? { userId } : {}) },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { question: true, intent: true, confidence: true, suggestedAction: true, createdAt: true }
      }),
      db.aIMemoryEvent.findMany({
        where: { shopId },
        orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
        take: 5,
        select: { topic: true, sku: true, queryCount: true, summary: true, importance: true, lastQuestion: true }
      }),
      db.aIPinnedInsight.findMany({
        where: { shopId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { title: true, insight: true, confidence: true, sourceQuestion: true }
      })
    ]);

    return { recentSessions, rememberedTopics, pinnedInsights };
  } catch {
    return { recentSessions: [], rememberedTopics: [], pinnedInsights: [] };
  }
}

function extractSku(question: string) {
  const match = question.toUpperCase().match(/\b[A-Z]{2,}-\d{2,}\b/);
  return match?.[0] ?? null;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
