import type { BatchDisposition, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function recordBatchReceipt(
  input: {
    shopId: string;
    productId: string;
    locationId: string;
    batchNumber: string;
    expiryDate: Date;
    quantityReceived: number;
    unitCost: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  return db.inventoryBatch.upsert({
    where: { productId_batchNumber: { productId: input.productId, batchNumber: input.batchNumber } },
    create: { ...input, quantityRemaining: input.quantityReceived, disposition: dispositionForExpiry(input.expiryDate) },
    update: {
      expiryDate: input.expiryDate,
      quantityReceived: input.quantityReceived,
      quantityRemaining: input.quantityReceived,
      unitCost: input.unitCost,
      disposition: dispositionForExpiry(input.expiryDate)
    }
  });
}

export async function getFefoPickingSuggestions(
  input: { shopId: string; productId: string; quantity: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  const batches = await db.inventoryBatch.findMany({
    where: { shopId: input.shopId, productId: input.productId, quantityRemaining: { gt: 0 }, disposition: { notIn: ["RECALL", "DISPOSED"] } },
    orderBy: { expiryDate: "asc" }
  });
  let remaining = input.quantity;
  const picks = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, batch.quantityRemaining);
    picks.push({ batchId: batch.id, batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantity });
    remaining -= quantity;
  }
  return { picks, unfilledQuantity: remaining };
}

export async function getExpiryAlerts(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const batches = await db.inventoryBatch.findMany({
    where: { shopId, quantityRemaining: { gt: 0 }, expiryDate: { lte: daysFromNow(90) } },
    include: { product: true, location: true },
    orderBy: { expiryDate: "asc" }
  });
  return batches.map((batch) => ({
    ...batch,
    daysUntilExpiry: daysBetween(new Date(), batch.expiryDate),
    alertWindow: alertWindow(batch.expiryDate),
    recommendedAction: batch.expiryDate < new Date() ? "Dispose" : daysBetween(new Date(), batch.expiryDate) <= 30 ? "Deep discount" : "Monitor"
  }));
}

export async function recallBatch(
  input: { shopId: string; batchId: string; reason: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  const batch = await db.inventoryBatch.update({
    where: { id: input.batchId, shopId: input.shopId },
    data: { disposition: "RECALL" },
    include: { shipments: true, product: true }
  });
  return {
    batch,
    notificationList: batch.shipments.map((shipment) => ({
      orderName: shipment.orderName,
      customerEmail: shipment.customerEmail,
      quantity: shipment.quantity,
      message: `Recall notice for ${batch.product.sku} batch ${batch.batchNumber}: ${input.reason}`
    }))
  };
}

export function dispositionForExpiry(expiryDate: Date): BatchDisposition {
  const days = daysBetween(new Date(), expiryDate);
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "DISCOUNT";
  if (days <= 90) return "EXPIRING";
  return "AVAILABLE";
}

function alertWindow(expiryDate: Date) {
  const days = daysBetween(new Date(), expiryDate);
  if (days <= 30) return 30;
  if (days <= 60) return 60;
  return 90;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}
