import type { InventoryValuationMethod, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type CostLayer = { quantityRemaining: number; unitCost: number; receivedAt: Date };

export async function upsertFinancialSettings(
  input: {
    shopId: string;
    valuationMethod?: InventoryValuationMethod;
    workingCapitalThreshold?: number;
    industryDioBenchmark?: number;
    industryDsoBenchmark?: number;
    industryDpoBenchmark?: number;
    defaultDsoDays?: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.financialIntelligence, db);

  return db.financialSettings.upsert({
    where: { shopId: input.shopId },
    create: input,
    update: {
      valuationMethod: input.valuationMethod,
      workingCapitalThreshold: input.workingCapitalThreshold,
      industryDioBenchmark: input.industryDioBenchmark,
      industryDsoBenchmark: input.industryDsoBenchmark,
      industryDpoBenchmark: input.industryDpoBenchmark,
      defaultDsoDays: input.defaultDsoDays
    }
  });
}

export async function getFinancialDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.financialIntelligence, db);

  const [settings, cashFlow, valuation, shrinkage, terms] = await Promise.all([
    getSettings(shopId, db),
    projectInventoryCashFlow(shopId, db),
    getInventoryValuationImpact(shopId, db),
    getMonthlyShrinkageReport(shopId, new Date(), db),
    getPaymentTermsOptimizer(shopId, db)
  ]);

  return {
    settings,
    cashFlow,
    valuation,
    shrinkage,
    terms,
    alerts: cashFlow.workingCapitalAlert ? [cashFlow.workingCapitalAlert] : []
  };
}

export async function projectInventoryCashFlow(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.financialIntelligence, db);

  const settings = await getSettings(shopId, db);
  const [purchaseOrders, products, salesMovements] = await Promise.all([
    db.purchaseOrder.findMany({
      where: {
        shopId,
        status: { in: ["PENDING_APPROVAL", "APPROVED", "SENT", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "INVOICED"] }
      },
      include: { supplier: true, lines: true }
    }),
    db.product.findMany({ where: { shopId }, include: { inventory: true } }),
    db.inventoryMovement.findMany({
      where: { shopId, type: "SALE", occurredAt: { gte: daysAgo(30) } },
      include: { product: true }
    })
  ]);

  const expectedSales30 = salesMovements.reduce((sum, movement) => sum + Math.abs(movement.quantity) * Number(movement.product.price), 0);
  const dailySalesCash = expectedSales30 / 30;
  const projected = [30, 60, 90].map((days) => {
    const cashNeeded = purchaseOrders
      .filter((po) => dueDateForPo(po.orderedAt, po.supplier.paymentTerms) <= daysFromNow(days))
      .reduce((sum, po) => sum + purchaseOrderCashNeed(po), 0);
    return {
      horizonDays: days,
      inventoryCashNeeded: round(cashNeeded),
      expectedSalesCashIn: round(dailySalesCash * days),
      netInventoryCashPosition: round(dailySalesCash * days - cashNeeded)
    };
  });

  const inventoryValue = products.reduce(
    (sum, product) => sum + product.inventory.reduce((inner, row) => inner + row.quantity, 0) * Number(product.cost),
    0
  );
  const cogs90 = await getCogsForDays(shopId, 90, db);
  const dpo = weightedSupplierDpo(purchaseOrders);
  const cycle = calculateCashConversionCycle({
    inventoryValue,
    cogsPeriod: cogs90,
    periodDays: 90,
    dso: settings.defaultDsoDays,
    dpo
  });
  const workingCapitalAlert =
    projected[0].inventoryCashNeeded > Number(settings.workingCapitalThreshold)
      ? {
          type: "WORKING_CAPITAL",
          severity: "warning",
          message: `Inventory cash needed in 30 days is $${projected[0].inventoryCashNeeded}, above threshold $${Number(settings.workingCapitalThreshold).toFixed(2)}.`,
          amount: projected[0].inventoryCashNeeded,
          threshold: Number(settings.workingCapitalThreshold)
        }
      : null;

  return {
    projected,
    cashConversionCycle: cycle,
    benchmarks: {
      dio: Number(settings.industryDioBenchmark),
      dso: Number(settings.industryDsoBenchmark),
      dpo: Number(settings.industryDpoBenchmark)
    },
    workingCapitalAlert
  };
}

export async function getPaymentTermsOptimizer(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.financialIntelligence, db);

  const suppliers = await db.supplier.findMany({
    where: { shopId },
    include: { purchaseOrders: { include: { lines: true }, where: { status: { notIn: ["CANCELLED", "CLOSED"] } } } },
    orderBy: { reliabilityScore: "desc" }
  });

  return suppliers
    .map((supplier) => {
      const netDays = parsePaymentTerms(supplier.paymentTerms);
      const openSpend = supplier.purchaseOrders.reduce((sum, po) => sum + purchaseOrderCashNeed(po), 0);
      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        paymentTerms: supplier.paymentTerms ?? "Due on receipt",
        netDays,
        openSpend: round(openSpend),
        recommendation:
          netDays < 60 && openSpend > 1000
            ? `Negotiate net-60 to free about $${round((openSpend / Math.max(netDays, 1)) * (60 - netDays))} of working-capital pressure.`
            : "Terms are acceptable for current spend."
      };
    })
    .sort((a, b) => b.openSpend - a.openSpend);
}

export async function getInventoryValuationImpact(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.financialIntelligence, db);

  const settings = await getSettings(shopId, db);
  const products = await db.product.findMany({
    where: { shopId },
    include: { inventory: true, costLayers: true }
  });

  const rows = products.map((product) => {
    const quantityOnHand = product.inventory.reduce((sum, row) => sum + row.quantity, 0);
    const layers = product.costLayers.length
      ? product.costLayers.map((layer) => ({
          quantityRemaining: layer.quantityRemaining,
          unitCost: Number(layer.unitCost),
          receivedAt: layer.receivedAt
        }))
      : [{ quantityRemaining: quantityOnHand, unitCost: Number(product.cost), receivedAt: new Date() }];
    const fifo = calculateInventoryValue(layers, "FIFO");
    const lifo = calculateInventoryValue(layers, "LIFO");
    const weightedAverage = calculateInventoryValue(layers, "WEIGHTED_AVERAGE");
    const selected = { FIFO: fifo, LIFO: lifo, WEIGHTED_AVERAGE: weightedAverage }[settings.valuationMethod];
    return {
      sku: product.sku,
      quantityOnHand,
      fifo,
      lifo,
      weightedAverage,
      selected,
      switchImpact: round(weightedAverage - fifo)
    };
  });

  return {
    method: settings.valuationMethod,
    rows,
    totals: {
      fifo: round(rows.reduce((sum, row) => sum + row.fifo, 0)),
      lifo: round(rows.reduce((sum, row) => sum + row.lifo, 0)),
      weightedAverage: round(rows.reduce((sum, row) => sum + row.weightedAverage, 0)),
      selected: round(rows.reduce((sum, row) => sum + row.selected, 0))
    }
  };
}

export async function recordInventoryAdjustment(
  input: {
    shopId: string;
    productId: string;
    locationId?: string;
    userId?: string;
    reason: "DAMAGED" | "STOLEN" | "EXPIRED" | "DATA_ERROR" | "CORRECTION";
    quantity: number;
    unitCost: number;
    note?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.financialIntelligence, db);

  const valueLost = Math.abs(input.quantity) * input.unitCost;
  await db.inventoryMovement.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      locationId: input.locationId,
      type: input.reason === "DAMAGED" ? "DAMAGE" : "ADJUSTMENT",
      quantity: -Math.abs(input.quantity),
      unitCost: input.unitCost,
      notes: input.note,
      reference: input.reason
    }
  });

  return db.inventoryAdjustment.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      locationId: input.locationId,
      userId: input.userId,
      reason: input.reason,
      quantity: -Math.abs(input.quantity),
      unitCost: input.unitCost,
      valueLost,
      note: input.note
    }
  });
}

export async function getMonthlyShrinkageReport(shopId: string, month: Date, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.financialIntelligence, db);

  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const [adjustments, sales] = await Promise.all([
    db.inventoryAdjustment.findMany({
      where: { shopId, occurredAt: { gte: start, lte: end } },
      include: { product: true, location: true, user: true }
    }),
    db.inventoryMovement.findMany({
      where: { shopId, type: "SALE", occurredAt: { gte: start, lte: end } },
      include: { product: true }
    })
  ]);
  const revenue = sales.reduce((sum, movement) => sum + Math.abs(movement.quantity) * Number(movement.product.price), 0);
  const valueLost = adjustments.reduce((sum, adjustment) => sum + Number(adjustment.valueLost), 0);
  const unitsLost = adjustments.reduce((sum, adjustment) => sum + Math.abs(adjustment.quantity), 0);

  return {
    month: start.toISOString(),
    unitsLost,
    valueLost: round(valueLost),
    revenue: round(revenue),
    shrinkagePercentOfRevenue: revenue === 0 ? 0 : round((valueLost / revenue) * 100),
    byReason: summarize(adjustments, (adjustment) => adjustment.reason),
    byLocation: summarize(adjustments, (adjustment) => adjustment.location?.name ?? "Unassigned"),
    byCategory: summarize(adjustments, (adjustment) => adjustment.product.category ?? "Uncategorized"),
    byStaff: summarize(adjustments, (adjustment) => adjustment.user?.name ?? "Unassigned")
  };
}

export async function exportShrinkageTaxCsv(shopId: string, month: Date, db: PrismaClient = prisma) {
  const report = await getMonthlyShrinkageReport(shopId, month, db);
  return buildShrinkageCsv(report);
}

export function calculateInventoryValue(layers: CostLayer[], method: InventoryValuationMethod) {
  if (method === "WEIGHTED_AVERAGE") {
    const units = layers.reduce((sum, layer) => sum + layer.quantityRemaining, 0);
    const value = layers.reduce((sum, layer) => sum + layer.quantityRemaining * layer.unitCost, 0);
    return round(units === 0 ? 0 : units * (value / units));
  }
  const sorted = [...layers].sort((a, b) =>
    method === "FIFO" ? a.receivedAt.getTime() - b.receivedAt.getTime() : b.receivedAt.getTime() - a.receivedAt.getTime()
  );
  return round(sorted.reduce((sum, layer) => sum + layer.quantityRemaining * layer.unitCost, 0));
}

export function calculateCashConversionCycle(input: {
  inventoryValue: number;
  cogsPeriod: number;
  periodDays: number;
  dso: number;
  dpo: number;
}) {
  const dailyCogs = input.cogsPeriod / input.periodDays;
  const dio = dailyCogs === 0 ? 0 : input.inventoryValue / dailyCogs;
  return {
    dio: round(dio),
    dso: input.dso,
    dpo: input.dpo,
    cashConversionCycle: round(dio + input.dso - input.dpo)
  };
}

export function parsePaymentTerms(terms?: string | null) {
  if (!terms) return 0;
  const net = terms.match(/net\s*(\d+)/i)?.[1];
  if (net) return Number(net);
  if (/due on receipt/i.test(terms)) return 0;
  if (/deposit/i.test(terms)) return 15;
  return 0;
}

export function buildShrinkageCsv(report: Awaited<ReturnType<typeof getMonthlyShrinkageReport>>) {
  const rows = ["Month,Units Lost,Value Lost,Revenue,Shrinkage % Revenue"];
  rows.push(`${report.month},${report.unitsLost},${report.valueLost},${report.revenue},${report.shrinkagePercentOfRevenue}`);
  rows.push("");
  rows.push("Reason,Units,Value");
  for (const row of report.byReason) {
    rows.push(`${row.key},${row.units},${row.value}`);
  }
  return rows.join("\n");
}

async function getSettings(shopId: string, db: PrismaClient) {
  return (
    (await db.financialSettings.findUnique({ where: { shopId } })) ??
    (await db.financialSettings.create({ data: { shopId } }))
  );
}

async function getCogsForDays(shopId: string, days: number, db: PrismaClient) {
  const movements = await db.inventoryMovement.findMany({
    where: { shopId, type: "SALE", occurredAt: { gte: daysAgo(days) } }
  });
  return movements.reduce((sum, movement) => sum + Math.abs(movement.quantity) * Number(movement.unitCost), 0);
}

function weightedSupplierDpo(purchaseOrders: Array<{ orderedAt: Date; supplier: { paymentTerms: string | null }; lines: Array<{ orderedQuantity: number; unitPrice: unknown }>; freightCost?: unknown; customsCost?: unknown; handlingCost?: unknown }>) {
  const totalSpend = purchaseOrders.reduce((sum, po) => sum + purchaseOrderCashNeed(po), 0);
  if (totalSpend === 0) return 0;
  return round(
    purchaseOrders.reduce((sum, po) => sum + parsePaymentTerms(po.supplier.paymentTerms) * purchaseOrderCashNeed(po), 0) / totalSpend
  );
}

function purchaseOrderCashNeed(po: { lines: Array<{ orderedQuantity: number; unitPrice: unknown }>; freightCost?: unknown; customsCost?: unknown; handlingCost?: unknown }) {
  return (
    po.lines.reduce((sum, line) => sum + line.orderedQuantity * Number(line.unitPrice), 0) +
    Number(po.freightCost ?? 0) +
    Number(po.customsCost ?? 0) +
    Number(po.handlingCost ?? 0)
  );
}

function dueDateForPo(orderedAt: Date, paymentTerms?: string | null) {
  const date = new Date(orderedAt);
  date.setDate(date.getDate() + parsePaymentTerms(paymentTerms));
  return date;
}

function summarize<T>(items: T[], keyFor: (item: T) => string) {
  const map = new Map<string, { key: string; units: number; value: number }>();
  for (const item of items as Array<T & { quantity: number; valueLost: unknown }>) {
    const key = keyFor(item);
    const current = map.get(key) ?? { key, units: 0, value: 0 };
    current.units += Math.abs(item.quantity);
    current.value += Number(item.valueLost);
    map.set(key, current);
  }
  return [...map.values()].map((row) => ({ ...row, value: round(row.value) })).sort((a, b) => b.value - a.value);
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function round(value: number) {
  return Number(value.toFixed(2));
}
