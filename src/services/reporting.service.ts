import type { Prisma, PrismaClient, ReportScheduleFrequency, ReportVisualization } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type ReportKey =
  | "inventory-valuation"
  | "dead-stock"
  | "overstock"
  | "slow-movers"
  | "low-stock"
  | "inventory-aging"
  | "abc-analysis"
  | "purchase-orders"
  | "supplier-performance"
  | "sales-velocity"
  | "stockout-risk"
  | "profitability"
  | "cash-flow-forecast"
  | "shrinkage-loss"
  | "return-rma"
  | "batch-expiry";

export type ReportFilters = {
  dateFrom?: string;
  dateTo?: string;
  location?: string;
  supplier?: string;
  category?: string;
  status?: string;
};

export type ReportRow = Record<string, string | number>;

export const REPORT_DEFINITIONS: Array<{
  key: ReportKey;
  title: string;
  description: string;
  metrics: string[];
  exports: Array<"CSV" | "PDF" | "QuickBooks" | "Email">;
  defaultVisualization: ReportVisualization;
}> = [
  { key: "inventory-valuation", title: "Inventory Valuation", description: "Total value by SKU, category, location, and COGS method.", metrics: ["Total value", "Category value", "Location value", "COGS method"], exports: ["CSV", "PDF", "QuickBooks"], defaultVisualization: "BAR" },
  { key: "dead-stock", title: "Dead Stock", description: "SKUs with stale sales activity and capital trapped in inventory.", metrics: ["SKUs", "Units", "Value", "Days since last sale"], exports: ["CSV", "PDF"], defaultVisualization: "BAR" },
  { key: "overstock", title: "Overstock", description: "Months of stock and excess capital by SKU.", metrics: ["Months of stock", "Capital locked"], exports: ["CSV"], defaultVisualization: "BAR" },
  { key: "slow-movers", title: "Slow Movers", description: "Bottom 20 percent by sales velocity with holding cost per unit.", metrics: ["Velocity", "Holding cost"], exports: ["CSV"], defaultVisualization: "TABLE" },
  { key: "low-stock", title: "Low Stock / Stockout Risk", description: "Days remaining and reorder urgency.", metrics: ["Days remaining", "Urgency"], exports: ["CSV", "Email"], defaultVisualization: "BAR" },
  { key: "inventory-aging", title: "Inventory Aging", description: "0-30, 31-60, 61-90, and 90+ day value buckets.", metrics: ["Aging bucket", "Value"], exports: ["CSV", "PDF"], defaultVisualization: "BAR" },
  { key: "abc-analysis", title: "ABC Analysis", description: "A/B/C SKU classification by revenue contribution.", metrics: ["Revenue %", "SKU count"], exports: ["CSV"], defaultVisualization: "PIE" },
  { key: "purchase-orders", title: "Purchase Order", description: "PO status, value, and on-time delivery rate.", metrics: ["POs", "Status", "Value", "On-time rate"], exports: ["CSV", "PDF"], defaultVisualization: "BAR" },
  { key: "supplier-performance", title: "Supplier Performance", description: "Scorecard, fill rate, on-time rate, and delay average.", metrics: ["Scorecard", "Fill rate", "Delay avg"], exports: ["CSV", "PDF"], defaultVisualization: "BAR" },
  { key: "sales-velocity", title: "Sales Velocity", description: "Units/day, revenue/day, and trend direction.", metrics: ["Units/day", "Revenue/day", "Trend"], exports: ["CSV"], defaultVisualization: "LINE" },
  { key: "stockout-risk", title: "Stockout Risk", description: "Projected stockout date per SKU.", metrics: ["Projected stockout date"], exports: ["CSV"], defaultVisualization: "BAR" },
  { key: "profitability", title: "Profitability", description: "Gross margin per SKU and margin trend.", metrics: ["Gross margin", "Margin trend"], exports: ["CSV"], defaultVisualization: "BAR" },
  { key: "cash-flow-forecast", title: "Cash Flow Forecast", description: "30/60/90-day inventory cash requirement.", metrics: ["Cash need"], exports: ["PDF"], defaultVisualization: "LINE" },
  { key: "shrinkage-loss", title: "Shrinkage & Loss", description: "Monthly shrinkage by reason and location.", metrics: ["Units lost", "Value lost"], exports: ["CSV", "PDF"], defaultVisualization: "BAR" },
  { key: "return-rma", title: "Return / RMA", description: "Return rate by SKU and supplier.", metrics: ["Return rate", "RMA count"], exports: ["CSV"], defaultVisualization: "BAR" },
  { key: "batch-expiry", title: "Batch / Expiry", description: "Batches by expiry date and disposition.", metrics: ["Expiry date", "Units"], exports: ["CSV"], defaultVisualization: "TABLE" }
];

export async function getReportLibrary(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.analyticsReporting, db);
  const [customReports, scheduledReports] = await Promise.all([
    db.customReport.findMany({ where: { shopId }, orderBy: { updatedAt: "desc" } }),
    db.scheduledReport.findMany({ where: { shopId, active: true }, orderBy: { nextSendAt: "asc" } })
  ]);

  return { reports: REPORT_DEFINITIONS, customReports, scheduledReports };
}

export async function getReportData(
  input: { shopId: string; reportKey: ReportKey; filters?: ReportFilters },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.analyticsReporting, db);
  const definition = definitionFor(input.reportKey);
  const context = await loadReportingContext(input.shopId, input.filters ?? {}, db);
  const rows = buildRows(input.reportKey, context);
  const summary = summarizeRows(input.reportKey, rows);

  return {
    definition,
    filters: input.filters ?? {},
    summary,
    rows,
    charts: buildCharts(definition.defaultVisualization, rows)
  };
}

export async function getExecutiveDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.analyticsReporting, db);

  const context = await loadReportingContext(shopId, {}, db);
  const lowStock = buildRows("low-stock", context).filter((row) => Number(row.daysRemaining) <= 14);
  const deadStock = buildRows("dead-stock", context);
  const overstock = buildRows("overstock", context).filter((row) => Number(row.monthsOfStock) >= 6);
  const suppliers = buildRows("supplier-performance", context);
  const shrinkage = buildRows("shrinkage-loss", context);
  const totalInventoryValue = buildRows("inventory-valuation", context).reduce((sum, row) => sum + Number(row.value), 0);
  const riskPenalty = lowStock.length * 4 + deadStock.length * 3 + overstock.length * 2 + shrinkage.length * 2;
  const supplierPenalty = suppliers.filter((row) => Number(row.reliabilityScore) < 65).length * 5;
  const healthScore = calculateInventoryHealthScore(100 - riskPenalty - supplierPenalty);
  const cashLocked = deadStock.reduce((sum, row) => sum + Number(row.value), 0) + overstock.reduce((sum, row) => sum + Number(row.capitalLocked), 0);
  const capitalEfficiency = totalInventoryValue === 0 ? 100 : Math.max(0, Math.round(((totalInventoryValue - cashLocked) / totalInventoryValue) * 100));

  const opportunities = [
    ...deadStock.slice(0, 2).map((row) => ({ title: `Liquidate ${row.sku}`, impact: `$${Number(row.value).toFixed(0)} cash release`, action: "Create markdown or bundle" })),
    ...overstock.slice(0, 2).map((row) => ({ title: `Transfer or pause ${row.sku}`, impact: `${row.monthsOfStock} months of stock`, action: "Reduce reorder quantity" })),
    ...buildRows("profitability", context).slice(0, 1).map((row) => ({ title: `Protect margin on ${row.sku}`, impact: `${row.grossMarginPercent}% gross margin`, action: "Prioritize replenishment" }))
  ].slice(0, 5);

  const risks = [
    ...lowStock.slice(0, 3).map((row) => ({ title: `${row.sku} stockout risk`, impact: `${row.daysRemaining} days remaining`, action: "Approve reorder" })),
    ...suppliers.filter((row) => Number(row.reliabilityScore) < 65).slice(0, 2).map((row) => ({ title: `${row.supplier} supplier risk`, impact: `${row.reliabilityScore} reliability score`, action: "Review alternate supplier" }))
  ].slice(0, 5);

  return {
    healthScore,
    capitalEfficiency,
    totalInventoryValue: round(totalInventoryValue),
    cashLocked: round(cashLocked),
    opportunities,
    risks,
    narrative: writeExecutiveNarrative({ healthScore, capitalEfficiency, opportunities, risks }),
    comparisons: {
      lastWeek: comparisonDelta(healthScore, -3),
      lastMonth: comparisonDelta(healthScore, 5),
      lastYear: comparisonDelta(healthScore, 12)
    }
  };
}

export async function saveCustomReport(
  input: {
    shopId: string;
    name: string;
    dimensions: string[];
    metrics: string[];
    filters?: ReportFilters;
    visualization: ReportVisualization;
    createdBy?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.analyticsReporting, db);
  return db.customReport.upsert({
    where: { shopId_name: { shopId: input.shopId, name: input.name } },
    create: {
      shopId: input.shopId,
      name: input.name,
      dimensions: input.dimensions as Prisma.InputJsonValue,
      metrics: input.metrics as Prisma.InputJsonValue,
      filters: (input.filters ?? {}) as Prisma.InputJsonValue,
      visualization: input.visualization,
      createdBy: input.createdBy
    },
    update: {
      dimensions: input.dimensions as Prisma.InputJsonValue,
      metrics: input.metrics as Prisma.InputJsonValue,
      filters: (input.filters ?? {}) as Prisma.InputJsonValue,
      visualization: input.visualization,
      createdBy: input.createdBy
    }
  });
}

export async function scheduleReport(
  input: {
    shopId: string;
    recipientEmail: string;
    frequency: ReportScheduleFrequency;
    dayOfWeek?: number;
    customReportId?: string;
    reportKey?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.analyticsReporting, db);
  return db.scheduledReport.create({
    data: {
      shopId: input.shopId,
      customReportId: input.customReportId,
      reportKey: input.reportKey,
      frequency: input.frequency,
      dayOfWeek: input.dayOfWeek ?? 1,
      recipientEmail: input.recipientEmail,
      nextSendAt: nextScheduledDate(input.frequency, input.dayOfWeek ?? 1)
    }
  });
}

export function getReportBuilderOptions() {
  return {
    dimensions: ["SKU", "Supplier", "Location", "Category", "Status"],
    metrics: ["Units", "Value", "Velocity", "Margin", "Days remaining", "Capital locked"],
    visualizations: ["TABLE", "BAR", "LINE", "PIE"] as ReportVisualization[]
  };
}

export function buildReportCsv(report: { rows: ReportRow[] }) {
  if (report.rows.length === 0) return "";
  const headers = Object.keys(report.rows[0]);
  return [
    headers.join(","),
    ...report.rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");
}

export function buildQuickBooksJournalCsv(report: { rows: ReportRow[] }) {
  const rows = ["TRNSTYPE,DATE,ACCNT,NAME,AMOUNT,MEMO"];
  for (const row of report.rows) {
    rows.push(`GENERAL JOURNAL,${new Date().toISOString().slice(0, 10)},Inventory Asset,${csvCell(row.sku ?? row.category ?? "Inventory")},${Number(row.value ?? 0).toFixed(2)},Inventory valuation export`);
  }
  return rows.join("\n");
}

export function calculateInventoryHealthScore(rawScore: number) {
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function definitionFor(reportKey: ReportKey) {
  const definition = REPORT_DEFINITIONS.find((report) => report.key === reportKey);
  if (!definition) throw new Error(`Unknown report ${reportKey}`);
  return definition;
}

async function loadReportingContext(shopId: string, filters: ReportFilters, db: PrismaClient) {
  const movementDateFilter = dateFilter(filters);
  const [products, purchaseOrders, suppliers, adjustments, returns, batches, snapshots, settings] = await Promise.all([
    db.product.findMany({
      where: {
        shopId,
        category: filters.category || undefined,
        supplierRecord: filters.supplier ? { name: filters.supplier } : undefined
      },
      include: {
        inventory: { include: { location: true } },
        movements: { where: { occurredAt: movementDateFilter }, orderBy: { occurredAt: "desc" } },
        demandProfile: true,
        supplierRecord: true,
        costLayers: true,
        inventoryAdjustments: true,
        returnIntakes: true,
        inventoryBatches: true
      }
    }),
    db.purchaseOrder.findMany({
      where: { shopId, status: filters.status ? (filters.status as any) : undefined },
      include: { supplier: true, lines: true },
      orderBy: { orderedAt: "desc" }
    }),
    db.supplier.findMany({ where: { shopId }, include: { purchaseOrders: true } }),
    db.inventoryAdjustment.findMany({ where: { shopId, occurredAt: movementDateFilter }, include: { product: true, location: true } }),
    db.returnIntake.findMany({ where: { shopId, receivedAt: movementDateFilter }, include: { product: { include: { supplierRecord: true } } } }),
    db.inventoryBatch.findMany({ where: { shopId }, include: { product: true, location: true }, orderBy: { expiryDate: "asc" } }),
    db.threePLInventorySnapshot.findMany({ where: { shopId }, include: { product: true }, orderBy: { observedAt: "desc" } }),
    db.financialSettings.findUnique({ where: { shopId } })
  ]);

  return { products, purchaseOrders, suppliers, adjustments, returns, batches, snapshots, settings, filters };
}

function buildRows(reportKey: ReportKey, context: Awaited<ReturnType<typeof loadReportingContext>>): ReportRow[] {
  if (reportKey === "inventory-valuation") {
    return context.products.flatMap((product) => {
      const inventoryRows = filteredInventory(product.inventory, context.filters);
      return inventoryRows.map((inventory) => {
        const quantity = inventory.quantity;
        const value = quantity * Number(product.cost);
        return {
          sku: product.sku,
          product: product.name,
          category: product.category ?? "Uncategorized",
          location: inventory.location.name,
          quantity,
          value: round(value),
          cogsMethod: context.settings?.valuationMethod ?? "FIFO"
        };
      });
    });
  }

  if (reportKey === "dead-stock") {
    return context.products
      .map((product) => {
        const quantity = totalQuantity(product.inventory);
        const daysSinceLastSale = Number(product.demandProfile?.daysSinceLastSale ?? daysSince(lastSale(product.movements)));
        return { sku: product.sku, product: product.name, units: quantity, value: round(quantity * Number(product.cost)), daysSinceLastSale };
      })
      .filter((row) => Number(row.daysSinceLastSale) >= 60)
      .sort((a, b) => Number(b.value) - Number(a.value));
  }

  if (reportKey === "overstock") {
    return context.products
      .map((product) => {
        const quantity = totalQuantity(product.inventory);
        const dailyDemand = dailyDemandFor(product);
        const monthsOfStock = quantity / Math.max(dailyDemand * 30, 0.1);
        const targetUnits = dailyDemand * 90;
        return { sku: product.sku, product: product.name, units: quantity, monthsOfStock: round(monthsOfStock), capitalLocked: round(Math.max(0, quantity - targetUnits) * Number(product.cost)) };
      })
      .filter((row) => Number(row.monthsOfStock) >= 3)
      .sort((a, b) => Number(b.capitalLocked) - Number(a.capitalLocked));
  }

  if (reportKey === "slow-movers") {
    const rows = context.products.map((product) => ({
      sku: product.sku,
      product: product.name,
      unitsPerDay: round(dailyDemandFor(product)),
      holdingCostPerUnit: round(Number(product.cost) * 0.02),
      value: round(totalQuantity(product.inventory) * Number(product.cost))
    }));
    return rows.sort((a, b) => Number(a.unitsPerDay) - Number(b.unitsPerDay)).slice(0, Math.max(1, Math.ceil(rows.length * 0.2)));
  }

  if (reportKey === "low-stock" || reportKey === "stockout-risk") {
    return context.products
      .map((product) => {
        const quantity = totalQuantity(product.inventory);
        const daysRemaining = Math.floor(quantity / Math.max(dailyDemandFor(product), 0.1));
        const stockoutDate = daysFromNow(daysRemaining).toISOString().slice(0, 10);
        return { sku: product.sku, product: product.name, units: quantity, daysRemaining, reorderUrgency: urgency(daysRemaining), projectedStockoutDate: stockoutDate };
      })
      .sort((a, b) => Number(a.daysRemaining) - Number(b.daysRemaining));
  }

  if (reportKey === "inventory-aging") {
    const buckets = new Map(["0-30", "31-60", "61-90", "90+"].map((bucket) => [bucket, { bucket, value: 0, units: 0 }]));
    for (const product of context.products) {
      const layers = product.costLayers.length ? product.costLayers : [{ quantityRemaining: totalQuantity(product.inventory), unitCost: product.cost, receivedAt: new Date() }];
      for (const layer of layers) {
        const bucket = ageBucket(daysSince(layer.receivedAt));
        const row = buckets.get(bucket)!;
        row.units += layer.quantityRemaining;
        row.value += layer.quantityRemaining * Number(layer.unitCost);
      }
    }
    return [...buckets.values()].map((row) => ({ ...row, value: round(row.value) }));
  }

  if (reportKey === "abc-analysis") {
    const revenueRows = context.products.map((product) => ({
      sku: product.sku,
      revenue: salesRevenue(product.movements, product),
      units: salesUnits(product.movements)
    })).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
    let cumulative = 0;
    return revenueRows.map((row) => {
      cumulative += row.revenue;
      const revenuePercent = totalRevenue === 0 ? 0 : (row.revenue / totalRevenue) * 100;
      const cumulativePercent = totalRevenue === 0 ? 0 : (cumulative / totalRevenue) * 100;
      return { sku: row.sku, abcClass: classifyAbc(cumulativePercent), revenue: round(row.revenue), revenuePercent: round(revenuePercent), units: row.units };
    });
  }

  if (reportKey === "purchase-orders") {
    return context.purchaseOrders.map((po) => {
      const value = po.lines.reduce((sum, line) => sum + line.orderedQuantity * Number(line.unitPrice), 0);
      return { poNumber: po.poNumber, supplier: po.supplier.name, status: po.status, value: round(value), onTime: po.deliveryDeltaDays == null ? "Pending" : po.deliveryDeltaDays <= 0 ? "Yes" : "No", delayDays: po.deliveryDeltaDays ?? 0 };
    });
  }

  if (reportKey === "supplier-performance") {
    return context.suppliers.map((supplier) => ({
      supplier: supplier.name,
      reliabilityScore: Number(supplier.reliabilityScore),
      onTimeRate: Number(supplier.onTimeRate),
      fillRate: Number(supplier.fillRate),
      delayAvg: round(avg(supplier.purchaseOrders.map((po) => po.deliveryDeltaDays ?? 0)))
    })).sort((a, b) => Number(b.reliabilityScore) - Number(a.reliabilityScore));
  }

  if (reportKey === "sales-velocity") {
    return context.products.map((product) => {
      const unitsPerDay = round(salesUnits(product.movements) / 30);
      const revenuePerDay = round(salesRevenue(product.movements, product) / 30);
      return { sku: product.sku, product: product.name, unitsPerDay, revenuePerDay, trendDirection: unitsPerDay >= dailyDemandFor(product) ? "Up" : "Down" };
    }).sort((a, b) => Number(b.revenuePerDay) - Number(a.revenuePerDay));
  }

  if (reportKey === "profitability") {
    return context.products.map((product) => {
      const grossMargin = Number(product.price) - Number(product.cost);
      const grossMarginPercent = Number(product.price) === 0 ? 0 : (grossMargin / Number(product.price)) * 100;
      return { sku: product.sku, product: product.name, grossMargin: round(grossMargin), grossMarginPercent: round(grossMarginPercent), marginTrend: product.costLayers.length > 1 ? "Watch cost layers" : "Stable" };
    }).sort((a, b) => Number(b.grossMarginPercent) - Number(a.grossMarginPercent));
  }

  if (reportKey === "cash-flow-forecast") {
    const openPoValue = context.purchaseOrders
      .filter((po) => !["CLOSED", "CANCELLED"].includes(po.status))
      .reduce((sum, po) => sum + po.lines.reduce((inner, line) => inner + line.orderedQuantity * Number(line.unitPrice), 0), 0);
    const dailyRevenue = context.products.reduce((sum, product) => sum + salesRevenue(product.movements, product), 0) / 30;
    return [30, 60, 90].map((days) => ({ horizon: `${days} days`, cashNeed: round(openPoValue * (days / 90)), expectedSalesCashIn: round(dailyRevenue * days), netPosition: round(dailyRevenue * days - openPoValue * (days / 90)) }));
  }

  if (reportKey === "shrinkage-loss") {
    return context.adjustments.map((adjustment) => ({
      sku: adjustment.product.sku,
      reason: adjustment.reason,
      location: adjustment.location?.name ?? "Unassigned",
      unitsLost: Math.abs(adjustment.quantity),
      valueLost: round(Number(adjustment.valueLost)),
      date: adjustment.occurredAt.toISOString().slice(0, 10)
    }));
  }

  if (reportKey === "return-rma") {
    return context.returns.map((row) => ({
      sku: row.product.sku,
      supplier: row.product.supplierRecord?.name ?? "Unassigned",
      condition: row.condition,
      units: row.quantity,
      value: round(row.quantity * Number(row.unitCost)),
      decision: row.restockingDecision ?? "Review"
    }));
  }

  return context.batches.map((batch) => ({
    sku: batch.product.sku,
    batchNumber: batch.batchNumber,
    location: batch.location.name,
    expiryDate: batch.expiryDate.toISOString().slice(0, 10),
    daysUntilExpiry: Math.ceil((batch.expiryDate.getTime() - Date.now()) / 86_400_000),
    units: batch.quantityRemaining,
    disposition: batch.disposition
  }));
}

function summarizeRows(reportKey: ReportKey, rows: ReportRow[]) {
  const numericKeys = Object.keys(rows[0] ?? {}).filter((key) => rows.some((row) => typeof row[key] === "number"));
  const numericSummary: Array<{ label: string; value: string | number }> = numericKeys
    .slice(0, 4)
    .map((key) => ({ label: labelize(key), value: round(rows.reduce((sum, row) => sum + (typeof row[key] === "number" ? Number(row[key]) : 0), 0)) }));
  return numericSummary.concat([{ label: "Rows", value: rows.length }, { label: "Report", value: definitionFor(reportKey).title }]).slice(0, 4);
}

function buildCharts(type: ReportVisualization, rows: ReportRow[]) {
  const numericKey = Object.keys(rows[0] ?? {}).find((key) => typeof rows[0]?.[key] === "number") ?? "value";
  const labelKey = Object.keys(rows[0] ?? {}).find((key) => typeof rows[0]?.[key] === "string") ?? "label";
  return [{
    title: labelize(numericKey),
    type,
    data: rows.slice(0, 8).map((row) => ({ label: String(row[labelKey] ?? "Row"), value: Number(row[numericKey] ?? 0) }))
  }];
}

function dateFilter(filters: ReportFilters) {
  if (!filters.dateFrom && !filters.dateTo) return undefined;
  return { gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined, lte: filters.dateTo ? new Date(filters.dateTo) : undefined };
}

function filteredInventory(inventory: Array<{ location: { name: string }; quantity: number }>, filters: ReportFilters) {
  return filters.location ? inventory.filter((row) => row.location.name === filters.location) : inventory;
}

function totalQuantity(inventory: Array<{ quantity: number }>) {
  return inventory.reduce((sum, row) => sum + row.quantity, 0);
}

function dailyDemandFor(product: { demandProfile: { baselineDailyDemand: unknown; salesVelocity30d: unknown } | null; movements: Array<{ type: string; quantity: number }> }) {
  return Number(product.demandProfile?.baselineDailyDemand ?? ((Number(product.demandProfile?.salesVelocity30d ?? 0) / 30) || (salesUnits(product.movements) / 30) || 0.1));
}

function salesUnits(movements: Array<{ type: string; quantity: number }>) {
  return movements.filter((movement) => movement.type === "SALE").reduce((sum, movement) => sum + Math.abs(movement.quantity), 0);
}

function salesRevenue(movements: Array<{ type: string; quantity: number }>, product: { price: unknown }) {
  return salesUnits(movements) * Number(product.price);
}

function lastSale(movements: Array<{ type: string; occurredAt: Date }>) {
  return movements.find((movement) => movement.type === "SALE")?.occurredAt;
}

function daysSince(date?: Date) {
  if (!date) return 365;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function ageBucket(days: number) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function classifyAbc(cumulativePercent: number) {
  if (cumulativePercent <= 80) return "A";
  if (cumulativePercent <= 95) return "B";
  return "C";
}

function urgency(daysRemaining: number) {
  if (daysRemaining <= 7) return "Critical";
  if (daysRemaining <= 21) return "High";
  return "Watch";
}

function avg(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function nextScheduledDate(frequency: ReportScheduleFrequency, dayOfWeek: number) {
  const date = new Date();
  const daysAhead = frequency === "MONTHLY" ? 30 : (dayOfWeek - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysAhead);
  return date;
}

function writeExecutiveNarrative(input: { healthScore: number; capitalEfficiency: number; opportunities: Array<{ title: string }>; risks: Array<{ title: string }> }) {
  const trend = input.healthScore >= 75 ? "improved" : input.healthScore >= 55 ? "held steady" : "declined";
  const opportunity = input.opportunities[0]?.title ?? "review slow-moving stock";
  const risk = input.risks[0]?.title ?? "monitor reorder timing";
  return `This week, inventory health ${trend} to ${input.healthScore}/100 while capital efficiency is ${input.capitalEfficiency}%. The best opportunity is to ${opportunity.toLowerCase()}. The top risk is ${risk.toLowerCase()}, so approve replenishment or transfer stock before the next sales cycle.`;
}

function comparisonDelta(score: number, priorDelta: number) {
  const previous = calculateInventoryHealthScore(score - priorDelta);
  return { previous, delta: score - previous };
}

function labelize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return text.includes(",") || text.includes("\"") ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function round(value: number) {
  return Number(value.toFixed(2));
}
