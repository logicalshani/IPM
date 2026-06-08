import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export interface LeadTimeProfileInput {
  shopId: string;
  supplierId: string;
  category: string;
  minimumDays: number;
  maximumDays: number;
  averageDays: number;
  bufferDays?: number;
}

export async function upsertSupplier(
  input: {
    shopId: string;
    name: string;
    email?: string;
    phone?: string;
    whatsappNumber?: string;
    defaultCurrency?: string;
    paymentTerms?: string;
    notes?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierIntelligence, db);

  return db.supplier.upsert({
    where: { shopId_name: { shopId: input.shopId, name: input.name } },
    create: input,
    update: {
      email: input.email,
      phone: input.phone,
      whatsappNumber: input.whatsappNumber,
      defaultCurrency: input.defaultCurrency,
      paymentTerms: input.paymentTerms,
      notes: input.notes
    }
  });
}

export interface PurchaseOrderEvidenceInput {
  shopId: string;
  supplierId: string;
  poNumber: string;
  orderedAt?: Date;
  promisedDeliveryDate?: Date;
  actualDeliveryDate?: Date;
  invoiceAccurate?: boolean;
  invoiceTotal?: number;
  expectedTotal?: number;
  notes?: string;
  lines: Array<{
    productId?: string;
    sku: string;
    category: string;
    orderedQuantity: number;
    receivedQuantity: number;
    unitPrice: number;
    invoiceUnitPrice?: number;
  }>;
}

export async function upsertLeadTimeProfile(input: LeadTimeProfileInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierIntelligence, db);

  return db.supplierCategoryLeadTime.upsert({
    where: { supplierId_category: { supplierId: input.supplierId, category: input.category } },
    create: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      category: input.category,
      minimumDays: input.minimumDays,
      maximumDays: input.maximumDays,
      averageDays: input.averageDays,
      dynamicEstimateDays: input.averageDays + (input.bufferDays ?? 0),
      bufferDays: input.bufferDays ?? 0
    },
    update: {
      minimumDays: input.minimumDays,
      maximumDays: input.maximumDays,
      averageDays: input.averageDays,
      dynamicEstimateDays: input.averageDays + (input.bufferDays ?? 0),
      bufferDays: input.bufferDays ?? 0
    }
  });
}

export async function recordPurchaseOrderEvidence(input: PurchaseOrderEvidenceInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierIntelligence, db);

  const deliveryDeltaDays =
    input.promisedDeliveryDate && input.actualDeliveryDate
      ? differenceInDays(input.actualDeliveryDate, input.promisedDeliveryDate)
      : undefined;

  const po = await db.purchaseOrder.upsert({
    where: { shopId_poNumber: { shopId: input.shopId, poNumber: input.poNumber } },
    create: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      poNumber: input.poNumber,
      orderedAt: input.orderedAt,
      promisedDeliveryDate: input.promisedDeliveryDate,
      actualDeliveryDate: input.actualDeliveryDate,
      deliveryDeltaDays,
      invoiceAccurate: input.invoiceAccurate,
      invoiceTotal: input.invoiceTotal,
      expectedTotal: input.expectedTotal,
      notes: input.notes,
      status: input.actualDeliveryDate ? "RECEIVED" : "SENT",
      lines: {
        create: input.lines.map((line) => ({
          productId: line.productId,
          sku: line.sku,
          category: line.category,
          orderedQuantity: line.orderedQuantity,
          receivedQuantity: line.receivedQuantity,
          unitPrice: line.unitPrice,
          invoiceUnitPrice: line.invoiceUnitPrice,
          priceVariance: Number(((line.invoiceUnitPrice ?? line.unitPrice) - line.unitPrice).toFixed(2))
        }))
      }
    },
    update: {
      promisedDeliveryDate: input.promisedDeliveryDate,
      actualDeliveryDate: input.actualDeliveryDate,
      deliveryDeltaDays,
      invoiceAccurate: input.invoiceAccurate,
      invoiceTotal: input.invoiceTotal,
      expectedTotal: input.expectedTotal,
      notes: input.notes,
      status: input.actualDeliveryDate ? "RECEIVED" : "SENT"
    },
    include: { lines: true }
  });

  await refreshSupplierPerformance(input.shopId, input.supplierId, db);
  await updateDynamicLeadTimes(input.shopId, input.supplierId, db);

  return po;
}

export async function refreshSupplierPerformance(shopId: string, supplierId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  const since = new Date();
  since.setDate(since.getDate() - 365);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { shopId, supplierId, orderedAt: { gte: since }, status: { notIn: ["DRAFT", "CANCELLED"] } },
    include: { lines: true },
    orderBy: { orderedAt: "desc" }
  });

  const score = calculateSupplierReliability(purchaseOrders);

  const current = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { reliabilityScore: true }
  });

  return db.supplier.update({
    where: { id: supplierId, shopId },
    data: {
      previousReliabilityScore: current?.reliabilityScore ?? 0,
      reliabilityScore: score.reliabilityScore,
      onTimeRate: score.onTimeRate,
      fillRate: score.fillRate,
      invoiceAccuracy: score.invoiceAccuracy
    }
  });
}

export async function updateDynamicLeadTimes(shopId: string, supplierId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { shopId, supplierId, orderedAt: { gte: since }, actualDeliveryDate: { not: null } },
    include: { lines: true }
  });

  const byCategory = new Map<string, number[]>();
  for (const po of purchaseOrders) {
    if (!po.orderedAt || !po.actualDeliveryDate) continue;
    const leadTime = Math.max(0, differenceInDays(po.actualDeliveryDate, po.orderedAt));
    for (const line of po.lines) {
      byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), leadTime]);
    }
  }

  const profiles = [];
  for (const [category, leadTimes] of byCategory.entries()) {
    const rollingAverage = average(leadTimes);
    const seasonalBuffer = await getSeasonalBufferDays(shopId, supplierId, new Date(), db);
    const existing = await db.supplierCategoryLeadTime.findUnique({
      where: { supplierId_category: { supplierId, category } }
    });
    const baseline = Number(existing?.averageDays ?? rollingAverage);
    const recentDegradationPercent = baseline === 0 ? 0 : ((rollingAverage - baseline) / baseline) * 100;

    profiles.push(
      await db.supplierCategoryLeadTime.upsert({
        where: { supplierId_category: { supplierId, category } },
        create: {
          shopId,
          supplierId,
          category,
          minimumDays: Math.min(...leadTimes),
          maximumDays: Math.max(...leadTimes),
          averageDays: rollingAverage,
          rolling90DayAverage: rollingAverage,
          dynamicEstimateDays: rollingAverage + seasonalBuffer,
          bufferDays: seasonalBuffer,
          recentDegradationPercent
        },
        update: {
          minimumDays: Math.min(...leadTimes),
          maximumDays: Math.max(...leadTimes),
          rolling90DayAverage: rollingAverage,
          dynamicEstimateDays: rollingAverage + seasonalBuffer,
          bufferDays: seasonalBuffer,
          recentDegradationPercent
        }
      })
    );
  }

  return profiles;
}

export async function getLeadTimeAlerts(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  return db.supplierCategoryLeadTime.findMany({
    where: { shopId, recentDegradationPercent: { gt: 20 } },
    include: { supplier: true },
    orderBy: { recentDegradationPercent: "desc" }
  });
}

export async function getSupplierDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  const [suppliers, leadTimeAlerts, contracts] = await Promise.all([
    db.supplier.findMany({
      where: { shopId },
      include: {
        leadTimes: true,
        reliabilitySnapshots: { orderBy: { month: "asc" }, take: 12 },
        purchaseOrders: { include: { lines: true }, orderBy: { orderedAt: "desc" }, take: 25 }
      },
      orderBy: { reliabilityScore: "desc" }
    }),
    getLeadTimeAlerts(shopId, db),
    db.supplierContract.findMany({
      where: { shopId, renewalDate: { lte: addDays(new Date(), 90), gte: new Date() } },
      include: { supplier: true },
      orderBy: { renewalDate: "asc" }
    })
  ]);

  const delayBuckets = buildDelayDistribution(suppliers.flatMap((supplier) => supplier.purchaseOrders));
  const worstSupplier = [...suppliers].sort((a, b) => Number(a.reliabilityScore) - Number(b.reliabilityScore))[0] ?? null;
  const bestSupplier = suppliers[0] ?? null;

  return {
    suppliers,
    leadTimeAlerts,
    contracts,
    delayBuckets,
    bestSupplier,
    worstSupplier,
    totals: {
      suppliers: suppliers.length,
      below60: suppliers.filter((supplier) => Number(supplier.reliabilityScore) < 60).length,
      expiringContracts: contracts.length,
      degradedLeadTimes: leadTimeAlerts.length
    }
  };
}

export async function getSupplierDetail(shopId: string, supplierId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierIntelligence, db);

  return db.supplier.findUniqueOrThrow({
    where: { id: supplierId, shopId },
    include: {
      leadTimes: true,
      reliabilitySnapshots: { orderBy: { month: "desc" }, take: 12 },
      purchaseOrders: { include: { lines: true }, orderBy: { orderedAt: "desc" }, take: 50 },
      priceLists: { include: { items: true }, orderBy: { effectiveFrom: "desc" }, take: 5 },
      contracts: { orderBy: { renewalDate: "asc" } },
      communications: { orderBy: { createdAt: "desc" }, take: 50 }
    }
  });
}

export async function createMonthlyReliabilitySnapshot(
  input: { shopId: string; supplierId: string; month: Date; category?: string | null },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierIntelligence, db);

  const start = startOfMonth(input.month);
  const end = endOfMonth(input.month);
  const purchaseOrders = await db.purchaseOrder.findMany({
    where: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      orderedAt: { gte: start, lte: end },
      lines: input.category ? { some: { category: input.category } } : undefined
    },
    include: { lines: true }
  });
  const score = calculateSupplierReliability(purchaseOrders);
  const averageDelayDays = average(purchaseOrders.map((po) => Math.max(0, po.deliveryDeltaDays ?? 0)));

  return db.supplierReliabilitySnapshot.upsert({
    where: {
      supplierId_month_category: {
        supplierId: input.supplierId,
        month: start,
        category: input.category ?? ""
      }
    },
    create: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      month: start,
      category: input.category ?? "",
      averageDelayDays,
      ...score
    },
    update: {
      averageDelayDays,
      ...score
    }
  });
}

export function calculateSupplierReliability(
  purchaseOrders: Array<{
    promisedDeliveryDate: Date | null;
    actualDeliveryDate: Date | null;
    invoiceAccurate: boolean | null;
    deliveryDeltaDays: number | null;
    lines: Array<{ orderedQuantity: number; receivedQuantity: number }>;
  }>
) {
  if (purchaseOrders.length === 0) {
    return { onTimeRate: 0, fillRate: 0, invoiceAccuracy: 0, reliabilityScore: 0 };
  }

  const delivered = purchaseOrders.filter((po) => po.actualDeliveryDate);
  const onTimeRate = delivered.length
    ? (delivered.filter((po) => (po.deliveryDeltaDays ?? 0) <= 0).length / delivered.length) * 100
    : 0;
  const orderedQuantity = purchaseOrders.flatMap((po) => po.lines).reduce((sum, line) => sum + line.orderedQuantity, 0);
  const receivedQuantity = purchaseOrders.flatMap((po) => po.lines).reduce((sum, line) => sum + line.receivedQuantity, 0);
  const fillRate = orderedQuantity === 0 ? 0 : Math.min(100, (receivedQuantity / orderedQuantity) * 100);
  const invoiceAudited = purchaseOrders.filter((po) => po.invoiceAccurate !== null);
  const invoiceAccuracy = invoiceAudited.length
    ? (invoiceAudited.filter((po) => po.invoiceAccurate).length / invoiceAudited.length) * 100
    : 0;
  const reliabilityScore = onTimeRate * 0.5 + fillRate * 0.3 + invoiceAccuracy * 0.2;

  return {
    onTimeRate: round(onTimeRate),
    fillRate: round(fillRate),
    invoiceAccuracy: round(invoiceAccuracy),
    reliabilityScore: round(reliabilityScore)
  };
}

export function buildDelayDistribution(purchaseOrders: Array<{ deliveryDeltaDays: number | null }>) {
  return [
    { label: "On time", count: purchaseOrders.filter((po) => (po.deliveryDeltaDays ?? 0) <= 0).length },
    { label: "1 day", count: purchaseOrders.filter((po) => po.deliveryDeltaDays === 1).length },
    { label: "2-3 days", count: purchaseOrders.filter((po) => (po.deliveryDeltaDays ?? 0) >= 2 && (po.deliveryDeltaDays ?? 0) <= 3).length },
    { label: "1 week", count: purchaseOrders.filter((po) => (po.deliveryDeltaDays ?? 0) >= 4 && (po.deliveryDeltaDays ?? 0) <= 7).length },
    { label: "2+ weeks", count: purchaseOrders.filter((po) => (po.deliveryDeltaDays ?? 0) >= 14).length }
  ];
}

async function getSeasonalBufferDays(shopId: string, supplierId: string, date: Date, db: PrismaClient) {
  const riskPeriods = await db.supplierSeasonalRiskPeriod.findMany({
    where: {
      shopId,
      OR: [{ supplierId }, { supplierId: null }],
      startsOn: { lte: date },
      endsOn: { gte: date }
    }
  });

  return riskPeriods.reduce((max, period) => Math.max(max, period.bufferDays), 0);
}

function differenceInDays(left: Date, right: Date) {
  return Math.round((left.getTime() - right.getTime()) / 86_400_000);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
