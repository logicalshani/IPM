import type { PrismaClient, ReturnCondition } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function logReturnIntake(
  input: {
    shopId: string;
    productId: string;
    supplierId?: string;
    orderName?: string;
    salesChannel?: string;
    condition: ReturnCondition;
    quantity: number;
    unitCost: number;
    margin: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  const decision = recommendRestockingDecision({
    condition: input.condition,
    margin: input.margin,
    returnRate: 0,
    demandScore: input.margin > input.unitCost ? 70 : 30
  });

  const returnRecord = await db.returnIntake.create({
    data: {
      ...input,
      salesChannel: input.salesChannel ?? "Shopify",
      restockingDecision: decision.decision,
      aiReason: decision.reason
    }
  });

  if (input.condition === "SUPPLIER_FAULT" || input.condition === "DEFECTIVE") {
    await maybeDraftSupplierRma(input.shopId, input.supplierId, db);
  }

  return returnRecord;
}

export async function maybeDraftSupplierRma(shopId: string, supplierId?: string, db: PrismaClient = prisma) {
  if (!supplierId) return null;
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const since = daysAgo(90);
  const returns = await db.returnIntake.findMany({
    where: { shopId, supplierId, receivedAt: { gte: since } }
  });
  const faultReturns = returns.filter((row) => row.condition === "SUPPLIER_FAULT" || row.condition === "DEFECTIVE");
  const defectRate = returns.length === 0 ? 0 : (faultReturns.length / returns.length) * 100;
  if (defectRate < 8) return null;

  return db.supplierRma.create({
    data: {
      shopId,
      supplierId,
      rmaNumber: `RMA-${Date.now()}`,
      defectRate,
      body: `Defect rate reached ${defectRate.toFixed(1)}% over the last 90 days. Please authorize RMA review for affected units.`
    }
  });
}

export async function getReturnAnalytics(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const returns = await db.returnIntake.findMany({
    where: { shopId, receivedAt: { gte: daysAgo(365) } },
    include: { product: { include: { supplierRecord: true } } },
    orderBy: { receivedAt: "desc" }
  });
  return {
    returns,
    bySku: summarize(returns, (row) => row.product.sku),
    bySupplier: summarize(returns, (row) => row.product.supplierRecord?.name ?? "Unassigned"),
    byChannel: summarize(returns, (row) => row.salesChannel),
    byCondition: summarize(returns, (row) => row.condition)
  };
}

export function recommendRestockingDecision(input: {
  condition: ReturnCondition;
  margin: number;
  returnRate: number;
  demandScore: number;
}) {
  if (input.condition === "RESELLABLE" && input.demandScore >= 50) {
    return { decision: "RESTOCK_NEW" as const, reason: "Item is resellable and demand is healthy." };
  }
  if (input.condition === "DAMAGED" && input.margin > 20) {
    return { decision: "RESTOCK_OPEN_BOX" as const, reason: "Margin supports an open-box markdown." };
  }
  if (input.condition === "DEFECTIVE" || input.condition === "SUPPLIER_FAULT") {
    return { decision: "DISPOSE" as const, reason: "Defective or supplier-fault item should not be restocked." };
  }
  return { decision: "LIQUIDATE" as const, reason: "Weak margin or demand favors liquidation." };
}

function summarize<T>(items: T[], keyFor: (item: T) => string) {
  const map = new Map<string, { key: string; units: number; value: number }>();
  for (const item of items as Array<T & { quantity: number; unitCost: unknown }>) {
    const key = keyFor(item);
    const current = map.get(key) ?? { key, units: 0, value: 0 };
    current.units += item.quantity;
    current.value += item.quantity * Number(item.unitCost);
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.units - a.units);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}
