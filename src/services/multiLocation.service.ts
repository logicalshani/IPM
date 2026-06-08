import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function suggestSmartTransfers(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const products = await db.product.findMany({
    where: { shopId },
    include: { inventory: { include: { location: true } }, demandProfile: true }
  });
  const suggestions = [];

  for (const product of products) {
    const dailyDemand = Number(product.demandProfile?.baselineDailyDemand ?? 0.5);
    const sorted = [...product.inventory].sort((a, b) => b.quantity - a.quantity);
    const source = sorted[0];
    const destination = sorted[sorted.length - 1];
    if (!source || !destination || source.locationId === destination.locationId) continue;
    const monthsAtSource = source.quantity / Math.max(dailyDemand * 30, 0.1);
    const daysAtDestination = destination.quantity / Math.max(dailyDemand, 0.1);
    if (monthsAtSource < 6 || daysAtDestination > 3) continue;
    const quantity = Math.max(1, Math.floor(Math.min(source.quantity - dailyDemand * 90, dailyDemand * 30)));
    const urgencyScore = Math.min(100, Math.round((3 - daysAtDestination) * 20 + monthsAtSource * 8));

    suggestions.push(
      await db.inventoryTransferSuggestion.create({
        data: {
          shopId,
          fromLocationId: source.locationId,
          toLocationId: destination.locationId,
          urgencyScore,
          costEstimate: quantity * 0.35,
          reason: `${source.location.name} has ${monthsAtSource.toFixed(1)} months while ${destination.location.name} has ${daysAtDestination.toFixed(1)} days.`,
          lines: {
            create: [{ productId: product.id, sku: product.sku, quantity, monthsAtSource, daysAtDestination }]
          }
        },
        include: { lines: true }
      })
    );
  }

  return suggestions;
}

export async function createInventoryTransfer(
  input: { shopId: string; fromLocationId: string; toLocationId: string; lines: Array<{ productId: string; sku: string; quantity: number }>; costEstimate?: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  return db.inventoryTransfer.create({
    data: {
      shopId: input.shopId,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      costEstimate: input.costEstimate ?? 0,
      lines: { create: input.lines }
    },
    include: { lines: true }
  });
}

export async function markTransferInTransit(shopId: string, transferId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const transfer = await db.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId, shopId }, include: { lines: true } });
  for (const line of transfer.lines) {
    const source = await db.productInventory.findUnique({ where: { productId_locationId: { productId: line.productId, locationId: transfer.fromLocationId } } });
    if (source) {
      await db.productInventory.update({
        where: { id: source.id },
        data: { quantity: source.quantity - line.quantity, inTransitQuantity: source.inTransitQuantity + line.quantity }
      });
    }
  }
  return db.inventoryTransfer.update({ where: { id: transferId, shopId }, data: { status: "IN_TRANSIT", shippedAt: new Date() }, include: { lines: true } });
}

export async function receiveInventoryTransfer(shopId: string, transferId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const transfer = await db.inventoryTransfer.findUniqueOrThrow({ where: { id: transferId, shopId }, include: { lines: true } });
  for (const line of transfer.lines) {
    await db.productInventory.upsert({
      where: { productId_locationId: { productId: line.productId, locationId: transfer.toLocationId } },
      create: { productId: line.productId, locationId: transfer.toLocationId, quantity: line.quantity },
      update: { quantity: { increment: line.quantity } }
    });
  }
  return db.inventoryTransfer.update({ where: { id: transferId, shopId }, data: { status: "RECEIVED", receivedAt: new Date() }, include: { lines: true } });
}

export async function upsertLocationReplenishmentRule(
  input: { shopId: string; productId: string; locationId: string; reorderPoint: number; reorderQuantity: number; abcClass?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  return db.locationReplenishmentRule.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    create: input,
    update: { reorderPoint: input.reorderPoint, reorderQuantity: input.reorderQuantity, abcClass: input.abcClass }
  });
}

export function classifyLocationAbc(revenueShare: number) {
  if (revenueShare >= 0.8) return "A";
  if (revenueShare >= 0.5) return "B";
  return "C";
}
