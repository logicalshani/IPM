import type { PrismaClient, ThreePLProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function upsertThreePLConnection(
  input: {
    shopId: string;
    provider: ThreePLProvider;
    name: string;
    locationId?: string;
    apiKeyRef?: string;
    webhookSecret?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  return db.threePLConnection.create({ data: input });
}

export async function recordThreePLInventorySnapshot(
  input: {
    shopId: string;
    productId: string;
    provider: ThreePLProvider;
    locationName: string;
    externalSku: string;
    threePLQuantity: number;
    shopifyQuantity: number;
    fbaFee?: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  const discrepancyQuantity = input.threePLQuantity - input.shopifyQuantity;
  return db.threePLInventorySnapshot.create({
    data: {
      ...input,
      fbaFee: input.fbaFee ?? 0,
      discrepancyQuantity,
      status: discrepancyQuantity === 0 ? "MATCHED" : "DISCREPANCY"
    }
  });
}

export async function handleThreePLReceivingConfirmation(
  input: {
    shopId: string;
    productId: string;
    locationId: string;
    quantityReceived: number;
    provider: ThreePLProvider;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.operationsIntelligence, db);

  const current = await db.productInventory.findUnique({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } }
  });

  return db.productInventory.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    create: { productId: input.productId, locationId: input.locationId, quantity: input.quantityReceived },
    update: { quantity: (current?.quantity ?? 0) + input.quantityReceived }
  });
}

export async function getWarehouseSyncDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.operationsIntelligence, db);

  const snapshots = await db.threePLInventorySnapshot.findMany({
    where: { shopId },
    include: { product: true },
    orderBy: { observedAt: "desc" },
    take: 50
  });
  return {
    snapshots,
    discrepancies: snapshots.filter((snapshot) => snapshot.status === "DISCREPANCY"),
    fbaStock: snapshots.filter((snapshot) => snapshot.provider === "AMAZON_FBA"),
    fbaFees: snapshots.filter((snapshot) => snapshot.provider === "AMAZON_FBA").reduce((sum, snapshot) => sum + Number(snapshot.fbaFee), 0)
  };
}

export function buildThreePLWebhookSkeleton(provider: ThreePLProvider) {
  return {
    provider,
    endpoint: "/api/operations/3pl/webhook",
    expectedPayload: {
      sku: "string",
      quantity: "number",
      location: "string",
      event: "inventory_sync | receiving_confirmation"
    }
  };
}
