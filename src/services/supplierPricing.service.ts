import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export interface PriceListInput {
  shopId: string;
  supplierId: string;
  name: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  currency?: string;
  items: Array<{
    productId?: string;
    sku: string;
    moq: number;
    unitPrice: number;
    retailPrice?: number;
  }>;
}

export async function saveSupplierPriceList(input: PriceListInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierPricing, db);

  const previousItems = await db.supplierPriceListItem.findMany({
    where: {
      priceList: {
        shopId: input.shopId,
        supplierId: input.supplierId,
        effectiveFrom: { lt: input.effectiveFrom }
      },
      sku: { in: input.items.map((item) => item.sku) }
    },
    include: { priceList: true },
    orderBy: { priceList: { effectiveFrom: "desc" } }
  });

  const priceList = await db.supplierPriceList.create({
    data: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      name: input.name,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      currency: input.currency ?? "USD",
      items: {
        create: input.items.map((item) => {
          const previous = previousItems.find((candidate) => candidate.sku === item.sku);
          const previousUnitPrice = previous ? Number(previous.unitPrice) : undefined;
          const priceChangePercent =
            previousUnitPrice && previousUnitPrice > 0
              ? ((item.unitPrice - previousUnitPrice) / previousUnitPrice) * 100
              : 0;
          const marginImpact =
            item.retailPrice === undefined
              ? 0
              : (item.retailPrice - item.unitPrice) - (item.retailPrice - (previousUnitPrice ?? item.unitPrice));

          return {
            productId: item.productId,
            sku: item.sku,
            moq: item.moq,
            unitPrice: item.unitPrice,
            previousUnitPrice,
            priceChangePercent: round(priceChangePercent),
            marginImpact: round(marginImpact)
          };
        })
      }
    },
    include: { items: true }
  });

  const changedSkus = priceList.items.filter((item) => Number(item.priceChangePercent) !== 0).map((item) => item.sku);
  const affectedOpenPurchaseOrders =
    changedSkus.length === 0
      ? []
      : await db.purchaseOrder.findMany({
          where: {
            shopId: input.shopId,
            supplierId: input.supplierId,
            status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] },
            lines: { some: { sku: { in: changedSkus } } }
          },
          include: { lines: true }
        });

  return { priceList, affectedOpenPurchaseOrders };
}

export async function getPriceChangeAlerts(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierPricing, db);

  return db.supplierPriceListItem.findMany({
    where: {
      priceChangePercent: { not: 0 },
      priceList: { shopId }
    },
    include: { priceList: { include: { supplier: true } }, product: true },
    orderBy: { priceChangePercent: "desc" },
    take: 50
  });
}

export async function saveSupplierContract(
  input: {
    shopId: string;
    supplierId: string;
    title: string;
    effectiveDate?: Date;
    renewalDate?: Date;
    paymentTerms?: string;
    moqTerms?: string;
    leadTimeCommitment?: string;
    returnPolicy?: string;
    exclusivityClauses?: string;
    aiSummary?: string;
    sourceFileName?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierPricing, db);

  const status = input.renewalDate && input.renewalDate < new Date() ? "EXPIRED" : "ACTIVE";
  return db.supplierContract.create({
    data: {
      ...input,
      status
    }
  });
}

export async function getContractExpiryAlerts(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierPricing, db);

  const now = new Date();
  const windows = [30, 60, 90];
  const contracts = await db.supplierContract.findMany({
    where: { shopId, renewalDate: { gte: now, lte: addDays(now, 90) } },
    include: { supplier: true },
    orderBy: { renewalDate: "asc" }
  });

  return contracts.map((contract) => {
    const daysUntilRenewal = contract.renewalDate ? differenceInDays(contract.renewalDate, now) : 0;
    return {
      ...contract,
      alertWindowDays: windows.find((window) => daysUntilRenewal <= window) ?? 90,
      daysUntilRenewal
    };
  });
}

export async function optimizeVolumeDiscounts(
  input: {
    shopId: string;
    budget: number;
    candidateSkus?: string[];
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierPricing, db);

  const tiers = await db.supplierPriceListItem.findMany({
    where: {
      priceList: { shopId: input.shopId, effectiveFrom: { lte: new Date() } },
      sku: input.candidateSkus?.length ? { in: input.candidateSkus } : undefined
    },
    include: { priceList: { include: { supplier: true } } },
    orderBy: [{ sku: "asc" }, { unitPrice: "asc" }]
  });

  const grouped = new Map<string, typeof tiers>();
  for (const tier of tiers) {
    grouped.set(tier.sku, [...(grouped.get(tier.sku) ?? []), tier]);
  }

  const suggestions = [];
  for (const [sku, skuTiers] of grouped.entries()) {
    const sorted = [...skuTiers].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
    const best = sorted[0];
    const baseline = sorted[sorted.length - 1];
    const spend = best.moq * Number(best.unitPrice);
    if (spend <= input.budget) {
      suggestions.push({
        sku,
        supplierId: best.priceList.supplierId,
        supplierName: best.priceList.supplier.name,
        targetMoq: best.moq,
        unitPrice: Number(best.unitPrice),
        estimatedSpend: round(spend),
        unitSavings: round(Number(baseline.unitPrice) - Number(best.unitPrice)),
        estimatedSavings: round((Number(baseline.unitPrice) - Number(best.unitPrice)) * best.moq)
      });
    }
  }

  return suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

export async function getPricingIntelligence(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierPricing, db);

  const [priceChanges, contractAlerts] = await Promise.all([
    getPriceChangeAlerts(shopId, db),
    getContractExpiryAlerts(shopId, db)
  ]);

  return {
    priceChanges,
    contractAlerts,
    totals: {
      priceChanges: priceChanges.length,
      expiringContracts: contractAlerts.length,
      severeMarginHits: priceChanges.filter((item) => Number(item.marginImpact) < -5).length
    }
  };
}

export function calculateInvoiceAccuracy(
  poLines: Array<{ unitPrice: number; invoiceUnitPrice?: number | null }>,
  tolerancePercent: number
) {
  if (poLines.length === 0) return 100;
  const accurate = poLines.filter((line) => {
    if (line.invoiceUnitPrice === null || line.invoiceUnitPrice === undefined) return false;
    const delta = Math.abs((line.invoiceUnitPrice - line.unitPrice) / line.unitPrice) * 100;
    return delta <= tolerancePercent;
  }).length;

  return round((accurate / poLines.length) * 100);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function differenceInDays(left: Date, right: Date) {
  return Math.ceil((left.getTime() - right.getTime()) / 86_400_000);
}

function round(value: number) {
  return Number(value.toFixed(2));
}
