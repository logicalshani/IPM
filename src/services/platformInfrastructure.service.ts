import type { ManagedStoreStatus, Prisma, PrismaClient, WhiteLabelStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type WhiteLabelInput = {
  shopId: string;
  agencyName: string;
  brandName: string;
  supportEmail: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customDomain?: string;
  emailFromName?: string;
  pdfFooterText?: string;
  status?: WhiteLabelStatus;
};

export type ManagedStoreInput = {
  shopId: string;
  shopifyDomain: string;
  name: string;
  currency?: string;
  status?: ManagedStoreStatus;
  inventoryEfficiencyScore?: number;
  revenue30d?: number;
  inventoryValue?: number;
  unitsOnHand?: number;
};

export async function upsertWhiteLabelProfile(input: WhiteLabelInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.platformInfrastructure, db);

  return db.whiteLabelProfile.upsert({
    where: { shopId: input.shopId },
    create: {
      shopId: input.shopId,
      agencyName: input.agencyName,
      brandName: input.brandName,
      supportEmail: input.supportEmail,
      logoUrl: input.logoUrl,
      primaryColor: input.primaryColor ?? "#0f766e",
      accentColor: input.accentColor ?? "#111827",
      customDomain: input.customDomain,
      emailFromName: input.emailFromName ?? input.brandName,
      pdfFooterText: input.pdfFooterText,
      status: input.status ?? "ACTIVE"
    },
    update: {
      agencyName: input.agencyName,
      brandName: input.brandName,
      supportEmail: input.supportEmail,
      logoUrl: input.logoUrl,
      primaryColor: input.primaryColor ?? "#0f766e",
      accentColor: input.accentColor ?? "#111827",
      customDomain: input.customDomain,
      emailFromName: input.emailFromName ?? input.brandName,
      pdfFooterText: input.pdfFooterText,
      status: input.status ?? "ACTIVE"
    }
  });
}

export async function upsertManagedStore(input: ManagedStoreInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.platformInfrastructure, db);

  return db.managedStore.upsert({
    where: { shopId_shopifyDomain: { shopId: input.shopId, shopifyDomain: input.shopifyDomain } },
    create: {
      shopId: input.shopId,
      shopifyDomain: input.shopifyDomain,
      name: input.name,
      currency: input.currency ?? "USD",
      status: input.status ?? "CONNECTED",
      inventoryEfficiencyScore: input.inventoryEfficiencyScore ?? 0,
      revenue30d: input.revenue30d ?? 0,
      inventoryValue: input.inventoryValue ?? 0,
      unitsOnHand: input.unitsOnHand ?? 0,
      lastSyncedAt: new Date()
    },
    update: {
      name: input.name,
      currency: input.currency ?? "USD",
      status: input.status ?? "CONNECTED",
      inventoryEfficiencyScore: input.inventoryEfficiencyScore ?? 0,
      revenue30d: input.revenue30d ?? 0,
      inventoryValue: input.inventoryValue ?? 0,
      unitsOnHand: input.unitsOnHand ?? 0,
      lastSyncedAt: new Date()
    }
  });
}

export async function suggestCrossStoreTransfers(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.platformInfrastructure, db);

  const stores = await db.managedStore.findMany({ where: { shopId, status: { in: ["CONNECTED", "SYNCING"] } } });
  if (stores.length < 2) return [];

  const overstocked = [...stores].sort((a, b) => Number(b.inventoryValue) - Number(a.inventoryValue))[0];
  const understocked = [...stores].sort((a, b) => Number(a.unitsOnHand) - Number(b.unitsOnHand))[0];
  if (!overstocked || !understocked || overstocked.id === understocked.id) return [];

  const efficiencyGap = Math.max(0, Number(understocked.inventoryEfficiencyScore) - Number(overstocked.inventoryEfficiencyScore));
  const quantity = Math.max(12, Math.min(96, Math.round((overstocked.unitsOnHand - understocked.unitsOnHand) * 0.12)));
  const valueMoved = Math.max(0, Math.round(Number(overstocked.inventoryValue) * 0.08 * 100) / 100);

  const suggestion = await db.crossStoreTransferSuggestion.create({
    data: {
      shopId,
      fromStoreId: overstocked.id,
      toStoreId: understocked.id,
      sku: "MULTI-STORE-MIX",
      productName: "Top transferable inventory mix",
      quantity,
      urgencyScore: Math.min(100, Math.round((efficiencyGap + quantity / 2) * 100) / 100),
      valueMoved,
      reason: `${overstocked.name} is carrying $${Number(overstocked.inventoryValue).toFixed(0)} of inventory while ${understocked.name} has the lowest units on hand.`
    },
    include: { fromStore: true, toStore: true }
  });

  return [suggestion];
}

export async function rememberAIContext(
  input: { shopId: string; userId?: string; question: string; sku?: string; productId?: string; topic?: string; summary?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.platformInfrastructure, db);

  const topic = input.topic ?? inferTopic(input.question, input.sku);
  const current = await db.aIMemoryEvent.findUnique({ where: { shopId_topic: { shopId: input.shopId, topic } } });
  const queryCount = (current?.queryCount ?? 0) + 1;

  return db.aIMemoryEvent.upsert({
    where: { shopId_topic: { shopId: input.shopId, topic } },
    create: {
      shopId: input.shopId,
      userId: input.userId,
      productId: input.productId,
      sku: input.sku,
      topic,
      queryCount,
      lastQuestion: input.question,
      summary: input.summary ?? `Merchant asked about ${topic}.`,
      importance: scoreImportance(queryCount, input.question)
    },
    update: {
      userId: input.userId,
      productId: input.productId,
      sku: input.sku,
      queryCount,
      lastQuestion: input.question,
      summary: input.summary ?? current?.summary ?? `Merchant asked about ${topic}.`,
      importance: scoreImportance(queryCount, input.question)
    }
  });
}

export async function pinAIInsight(
  input: { shopId: string; title: string; insight: string; sessionId?: string; sourceQuestion?: string; confidence?: string; tags?: string[]; createdBy?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.platformInfrastructure, db);

  return db.aIPinnedInsight.create({
    data: {
      shopId: input.shopId,
      title: input.title,
      insight: input.insight,
      sessionId: input.sessionId,
      sourceQuestion: input.sourceQuestion,
      confidence: input.confidence ?? "Medium",
      tags: (input.tags ?? []) as Prisma.InputJsonValue,
      createdBy: input.createdBy
    }
  });
}

export async function getPlatformInfrastructureDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.platformInfrastructure, db);

  const [whiteLabel, stores, transfers, memories, pinnedInsights] = await Promise.all([
    db.whiteLabelProfile.findUnique({ where: { shopId } }),
    db.managedStore.findMany({ where: { shopId }, orderBy: [{ inventoryEfficiencyScore: "desc" }, { name: "asc" }] }),
    db.crossStoreTransferSuggestion.findMany({
      where: { shopId },
      include: { fromStore: true, toStore: true },
      orderBy: [{ status: "asc" }, { urgencyScore: "desc" }],
      take: 10
    }),
    db.aIMemoryEvent.findMany({ where: { shopId }, orderBy: [{ importance: "desc" }, { updatedAt: "desc" }], take: 8 }),
    db.aIPinnedInsight.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 8 })
  ]);

  const topStore = stores[0] ?? null;
  const totalInventoryValue = stores.reduce((sum, store) => sum + Number(store.inventoryValue), 0);
  const totalRevenue30d = stores.reduce((sum, store) => sum + Number(store.revenue30d), 0);

  return {
    whiteLabel,
    stores,
    transfers,
    memories,
    pinnedInsights,
    metrics: {
      whiteLabelActive: whiteLabel?.status === "ACTIVE",
      storeCount: stores.length,
      topStoreName: topStore?.name ?? "No stores",
      topStoreEfficiency: topStore ? Number(topStore.inventoryEfficiencyScore) : 0,
      totalInventoryValue,
      totalRevenue30d,
      pinnedInsights: pinnedInsights.length,
      rememberedTopics: memories.length
    }
  };
}

function inferTopic(question: string, sku?: string) {
  if (sku) return `sku:${sku.toUpperCase()}`;
  const normalized = question.toLowerCase();
  if (normalized.includes("supplier")) return "supplier reliability";
  if (normalized.includes("cash")) return "cash flow";
  if (normalized.includes("stockout") || normalized.includes("reorder")) return "reorder risk";
  if (normalized.includes("sale") || normalized.includes("dead stock")) return "markdown candidates";
  return normalized.split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || "general inventory";
}

function scoreImportance(queryCount: number, question: string) {
  const urgency = /(urgent|black friday|stockout|cash|supplier|risk|margin)/i.test(question) ? 25 : 0;
  return Math.min(100, 40 + queryCount * 8 + urgency);
}
