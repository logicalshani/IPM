import type { CountMode, Prisma, PrismaClient, StocktakeLineStatus, StocktakeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inventorySyncQueue } from "@/lib/redis";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type VarianceBand = "match" | "warning" | "critical";

export interface CreateStocktakeInput {
  shopId: string;
  name: string;
  locationId?: string;
  assignedUserId?: string;
  scheduledDate?: Date;
  mode: CountMode;
  filters?: Prisma.InputJsonValue;
  blindCount?: boolean;
}

export interface CountLineInput {
  shopId: string;
  sessionId: string;
  productId: string;
  countedQuantity: number;
  countSource: "barcode" | "manual" | "csv" | "split";
}

export async function createStocktakeSession(input: CreateStocktakeInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stocktakes, db);

  return db.stocktakeSession.create({
    data: {
      shopId: input.shopId,
      name: input.name,
      locationId: input.locationId,
      assignedUserId: input.assignedUserId,
      scheduledDate: input.scheduledDate,
      mode: input.mode,
      filters: input.filters,
      blindCount: input.blindCount ?? input.mode === "BLIND"
    }
  });
}

export async function startStocktakeSession(shopId: string, sessionId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stocktakes, db);

  return db.stocktakeSession.update({
    where: { id: sessionId, shopId },
    data: { status: "IN_PROGRESS" }
  });
}

export async function seedStocktakeLines(shopId: string, sessionId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stocktakes, db);

  const session = await db.stocktakeSession.findUniqueOrThrow({ where: { id: sessionId, shopId } });
  const products = await db.product.findMany({
    where: buildProductFilter(shopId, session.filters as Prisma.JsonObject | null),
    include: {
      inventory: session.locationId ? { where: { locationId: session.locationId } } : true
    }
  });

  await db.stocktakeLine.createMany({
    data: products.map((product) => ({
      sessionId,
      productId: product.id,
      expectedQuantity: product.inventory.reduce((sum, row) => sum + row.quantity, 0)
    })),
    skipDuplicates: true
  });

  return db.stocktakeLine.findMany({
    where: { sessionId },
    include: { product: true },
    orderBy: { product: { sku: "asc" } }
  });
}

export async function countStocktakeLine(input: CountLineInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stocktakes, db);

  const session = await db.stocktakeSession.findUniqueOrThrow({
    where: { id: input.sessionId, shopId: input.shopId }
  });

  const line = await db.stocktakeLine.findUniqueOrThrow({
    where: { sessionId_productId: { sessionId: input.sessionId, productId: input.productId } },
    include: { product: true }
  });

  const variance = calculateVariance({
    expectedQuantity: line.expectedQuantity,
    countedQuantity: input.countedQuantity,
    unitCost: Number(line.product.cost),
    thresholdPercent: Number(session.varianceThresholdPercent),
    thresholdValue: Number(session.varianceThresholdValue)
  });

  return db.stocktakeLine.update({
    where: { id: line.id },
    data: {
      countedQuantity: input.countedQuantity,
      varianceUnits: variance.units,
      varianceValue: variance.value,
      variancePercent: variance.percent,
      countSource: input.countSource,
      status: variance.band === "match" ? "CONFIRMED" : "OPEN",
      lastCountedAt: new Date()
    },
    include: { product: true }
  });
}

export async function setStocktakeLineInvestigation(
  input: {
    shopId: string;
    sessionId: string;
    lineId: string;
    status: Extract<StocktakeLineStatus, "NEEDS_INVESTIGATION" | "CONFIRMED" | "RECOUNT">;
    note?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stocktakes, db);

  await db.stocktakeSession.findUniqueOrThrow({
    where: { id: input.sessionId, shopId: input.shopId }
  });

  return db.stocktakeLine.update({
    where: { id: input.lineId, sessionId: input.sessionId },
    data: { status: input.status, investigationNote: input.note }
  });
}

export async function getDiscrepancyInvestigation(
  shopId: string,
  productId: string,
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stocktakes, db);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const movements = await db.inventoryMovement.findMany({
    where: { shopId, productId, occurredAt: { gte: since } },
    orderBy: { occurredAt: "desc" }
  });

  return {
    movements,
    lastReceiving: movements.find((movement) => movement.type === "RECEIVING") ?? null,
    lastTransfer:
      movements.find((movement) => movement.type === "TRANSFER_IN" || movement.type === "TRANSFER_OUT") ??
      null,
    lastAdjustment: movements.find((movement) => movement.type === "ADJUSTMENT") ?? null
  };
}

export async function submitForApproval(shopId: string, sessionId: string, db: PrismaClient = prisma) {
  return transitionStocktake(shopId, sessionId, "PENDING_APPROVAL", db);
}

export async function approveStocktakeLines(
  input: { shopId: string; sessionId: string; lineIds: string[]; rejectedLineIds?: string[] },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stocktakes, db);

  await db.stocktakeSession.findUniqueOrThrow({
    where: { id: input.sessionId, shopId: input.shopId }
  });

  const approved = await db.stocktakeLine.updateMany({
    where: { id: { in: input.lineIds }, sessionId: input.sessionId },
    data: { status: "APPROVED" }
  });

  if (input.rejectedLineIds?.length) {
    await db.stocktakeLine.updateMany({
      where: { id: { in: input.rejectedLineIds }, sessionId: input.sessionId },
      data: { status: "RECOUNT" }
    });
  }

  return approved;
}

export async function approveStocktakeSession(
  input: { shopId: string; sessionId: string; approvedById: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stocktakes, db);

  return db.stocktakeSession.update({
    where: { id: input.sessionId, shopId: input.shopId },
    data: { status: "APPROVED", approvedById: input.approvedById }
  });
}

export async function syncApprovedStocktake(shopId: string, sessionId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stocktakes, db);

  const session = await db.stocktakeSession.update({
    where: { id: sessionId, shopId, status: "APPROVED" },
    data: { status: "SYNCED" }
  });

  await inventorySyncQueue?.add("sync-stocktake", { shopId, sessionId });
  return session;
}

export async function getStocktakeDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stocktakes, db);

  const [sessions, shrinkageLines] = await Promise.all([
    db.stocktakeSession.findMany({
      where: { shopId },
      include: {
        location: true,
        assignedUser: true,
        lines: { include: { product: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    }),
    db.stocktakeLine.findMany({
      where: {
        session: { shopId },
        varianceUnits: { not: 0 }
      },
      include: {
        product: true,
        session: { include: { location: true } }
      },
      orderBy: { varianceValue: "desc" },
      take: 50
    })
  ]);

  const shrinkage = summarizeShrinkage(shrinkageLines);

  return {
    sessions,
    shrinkage,
    totals: {
      active: sessions.filter((session) => ["DRAFT", "IN_PROGRESS", "PENDING_APPROVAL"].includes(session.status)).length,
      pendingApproval: sessions.filter((session) => session.status === "PENDING_APPROVAL").length,
      criticalVariances: sessions.flatMap((session) => session.lines).filter((line) => Math.abs(Number(line.varianceValue)) > 50).length
    }
  };
}

export function calculateVariance(input: {
  expectedQuantity: number;
  countedQuantity: number;
  unitCost: number;
  thresholdPercent: number;
  thresholdValue: number;
}) {
  const units = input.countedQuantity - input.expectedQuantity;
  const value = Number((units * input.unitCost).toFixed(2));
  const percent =
    input.expectedQuantity === 0 ? (input.countedQuantity === 0 ? 0 : 100) : Number(((units / input.expectedQuantity) * 100).toFixed(2));
  const absolutePercent = Math.abs(percent);
  const absoluteValue = Math.abs(value);
  const band: VarianceBand =
    units === 0
      ? "match"
      : absolutePercent <= input.thresholdPercent && absoluteValue <= input.thresholdValue
        ? "warning"
        : "critical";

  return { units, value, percent, band };
}

function buildProductFilter(shopId: string, filters: Prisma.JsonObject | null) {
  const where: Prisma.ProductWhereInput = { shopId };

  if (filters?.category && typeof filters.category === "string") {
    where.category = filters.category;
  }

  if (filters?.supplier && typeof filters.supplier === "string") {
    where.supplier = filters.supplier;
  }

  return where;
}

function transitionStocktake(
  shopId: string,
  sessionId: string,
  status: StocktakeStatus,
  db: PrismaClient
) {
  return db.stocktakeSession.update({
    where: { id: sessionId, shopId },
    data: { status }
  });
}

function summarizeShrinkage(lines: Array<{ product: { sku: string; name: string }; session: { location: { name: string } | null }; varianceUnits: number; varianceValue: unknown }>) {
  const bySku = new Map<string, { sku: string; name: string; units: number; value: number; events: number }>();
  const byLocation = new Map<string, { location: string; units: number; value: number; events: number }>();

  for (const line of lines) {
    const skuSummary = bySku.get(line.product.sku) ?? {
      sku: line.product.sku,
      name: line.product.name,
      units: 0,
      value: 0,
      events: 0
    };
    skuSummary.units += line.varianceUnits;
    skuSummary.value += Number(line.varianceValue);
    skuSummary.events += 1;
    bySku.set(line.product.sku, skuSummary);

    const locationName = line.session.location?.name ?? "All locations";
    const locationSummary = byLocation.get(locationName) ?? {
      location: locationName,
      units: 0,
      value: 0,
      events: 0
    };
    locationSummary.units += line.varianceUnits;
    locationSummary.value += Number(line.varianceValue);
    locationSummary.events += 1;
    byLocation.set(locationName, locationSummary);
  }

  return {
    bySku: [...bySku.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5),
    byLocation: [...byLocation.values()].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5)
  };
}
