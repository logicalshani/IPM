import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inventorySyncQueue } from "@/lib/redis";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function addCompetitorProduct(
  input: { shopId: string; productId: string; competitorName: string; url: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.competitorMonitor, db);

  return db.competitorProduct.create({ data: input });
}

export async function recordCompetitorPrice(
  input: { shopId: string; competitorProductId: string; observedPrice: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.competitorMonitor, db);

  const competitorProduct = await db.competitorProduct.findUniqueOrThrow({
    where: { id: input.competitorProductId },
    include: { product: true }
  });
  const merchantPrice = Number(competitorProduct.product.price);
  const priceDelta = input.observedPrice - merchantPrice;
  const recommendation = recommendPriceResponse(merchantPrice, input.observedPrice);

  return db.competitorPriceSnapshot.create({
    data: {
      competitorProductId: input.competitorProductId,
      observedPrice: input.observedPrice,
      merchantPrice,
      priceDelta,
      recommendation
    }
  });
}

export async function enqueueWeeklyCompetitorScrape(shopId: string) {
  await inventorySyncQueue?.add("weekly-competitor-price-scrape", { shopId });
  return { queued: Boolean(inventorySyncQueue), worker: "playwright-price-monitor" };
}

export async function getCompetitorDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.competitorMonitor, db);

  const products = await db.competitorProduct.findMany({
    where: { shopId, active: true },
    include: {
      product: true,
      snapshots: { orderBy: { observedAt: "desc" }, take: 3 }
    },
    orderBy: { updatedAt: "desc" }
  });

  return {
    products,
    undercutAlerts: products.filter((item) => item.snapshots[0] && Number(item.snapshots[0].observedPrice) < Number(item.product.price))
  };
}

export function recommendPriceResponse(merchantPrice: number, competitorPrice: number) {
  if (competitorPrice < merchantPrice * 0.9) return "Differentiate or bundle to defend margin";
  if (competitorPrice < merchantPrice) return "Consider tactical reprice on top-selling SKU";
  return "Hold price and monitor";
}
