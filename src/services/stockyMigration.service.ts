import type { MigrationEntityType, Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { migrationQueue } from "@/lib/redis";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type FieldMapping = Record<string, string>;
export type CsvRow = Record<string, string | undefined>;

export const STOCKY_IMPORT_TYPES: MigrationEntityType[] = ["SUPPLIERS", "PRODUCTS", "PURCHASE_ORDERS", "STOCK_COUNTS", "TRANSFERS", "HISTORICAL_DATA"];

export const REQUIRED_FIELDS: Record<MigrationEntityType, string[]> = {
  SUPPLIERS: ["name"],
  PRODUCTS: ["sku", "name"],
  PURCHASE_ORDERS: ["poNumber", "supplierName"],
  STOCK_COUNTS: ["sku", "countedQuantity"],
  TRANSFERS: ["sku", "fromLocation", "toLocation", "quantity"],
  HISTORICAL_DATA: ["sku", "eventType", "occurredAt"]
};

export function mapStockyRow(row: CsvRow, fieldMapping: FieldMapping) {
  return Object.fromEntries(Object.entries(fieldMapping).map(([stockyColumn, impField]) => [impField, normalizeStockyValue(row[stockyColumn])]));
}

export function validateStockyRows(entityType: MigrationEntityType, rows: CsvRow[], fieldMapping: FieldMapping) {
  const mappedRows = rows.map((row, index) => ({ rowNumber: index + 1, mapped: mapStockyRow(row, fieldMapping), raw: row }));
  const seenSkus = new Set<string>();
  const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
  const warnings: Array<{ rowNumber: number; field: string; message: string }> = [];

  for (const row of mappedRows) {
    for (const required of REQUIRED_FIELDS[entityType]) {
      if (!String(row.mapped[required] ?? "").trim()) errors.push({ rowNumber: row.rowNumber, field: required, message: "Missing required field" });
    }
    const sku = String(row.mapped.sku ?? "").trim().toUpperCase();
    if (sku) {
      if (seenSkus.has(sku)) warnings.push({ rowNumber: row.rowNumber, field: "sku", message: `Duplicate SKU in import preview: ${sku}` });
      seenSkus.add(sku);
    }
    if ("supplierName" in row.mapped && !String(row.mapped.supplierName ?? "").trim()) {
      warnings.push({ rowNumber: row.rowNumber, field: "supplierName", message: "Blank Stocky supplier name will map to Unassigned supplier" });
    }
    if (String(row.raw["Variant Option"] ?? "").includes("/")) {
      warnings.push({ rowNumber: row.rowNumber, field: "variant", message: "Split variant row detected; IMP will merge by SKU and option values" });
    }
    if (Object.keys(row.raw).some((key) => key.toLowerCase().includes("location:"))) {
      warnings.push({ rowNumber: row.rowNumber, field: "location", message: "Multi-location Stocky format detected" });
    }
  }

  return {
    entityType,
    rows: mappedRows,
    validRows: mappedRows.length - errors.length,
    errors,
    warnings,
    canImport: errors.length === 0
  };
}

export async function createMigrationJob(
  input: { shopId: string; entityType: MigrationEntityType; fieldMapping: FieldMapping; rows: CsvRow[]; dryRun?: boolean; createdBy?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.stockyMigration, db);
  const preview = validateStockyRows(input.entityType, input.rows, input.fieldMapping);
  const job = await db.migrationJob.create({
    data: {
      shopId: input.shopId,
      dryRun: input.dryRun ?? true,
      status: preview.canImport ? "READY" : "VALIDATING",
      fieldMapping: input.fieldMapping as Prisma.InputJsonValue,
      summary: previewSummary(preview) as Prisma.InputJsonValue,
      rollbackToken: randomBytes(12).toString("hex"),
      createdBy: input.createdBy
    }
  });

  await writeMigrationLog(
    {
      shopId: input.shopId,
      jobId: job.id,
      entityType: input.entityType,
      level: preview.canImport ? "INFO" : "ERROR",
      message: preview.canImport ? `Validated ${preview.rows.length} ${input.entityType} rows` : `Validation found ${preview.errors.length} errors`,
      mappedRow: previewSummary(preview)
    },
    db
  );

  return { job, preview };
}

export async function queueMigrationJob(jobId: string, shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stockyMigration, db);
  await db.migrationJob.update({ where: { id: jobId }, data: { status: "RUNNING", startedAt: new Date() } });
  await migrationQueue?.add("process-stocky-csv-migration", { shopId, jobId });
  return { queued: Boolean(migrationQueue), jobId };
}

export async function rollbackMigrationJob(jobId: string, shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.stockyMigration, db);
  const job = await db.migrationJob.update({ where: { id: jobId }, data: { status: "ROLLED_BACK", completedAt: new Date() } });
  await writeMigrationLog({ shopId, jobId, entityType: "HISTORICAL_DATA", level: "WARN", message: "Rollback requested; imported rows should be reverted by rollback token" }, db);
  await migrationQueue?.add("rollback-migration", { shopId, jobId, rollbackToken: job.rollbackToken });
  return { job, queued: Boolean(migrationQueue) };
}

export async function writeMigrationLog(
  input: {
    shopId: string;
    jobId: string;
    entityType: MigrationEntityType;
    rowNumber?: number;
    level?: string;
    message: string;
    rawRow?: unknown;
    mappedRow?: unknown;
    importedId?: string;
    skipped?: boolean;
    reason?: string;
  },
  db: PrismaClient = prisma
) {
  return db.migrationLog.create({
    data: {
      shopId: input.shopId,
      jobId: input.jobId,
      entityType: input.entityType,
      rowNumber: input.rowNumber,
      level: input.level ?? "INFO",
      message: input.message,
      rawRow: json(input.rawRow),
      mappedRow: json(input.mappedRow),
      importedId: input.importedId,
      skipped: input.skipped ?? false,
      reason: input.reason
    }
  });
}

function previewSummary(preview: ReturnType<typeof validateStockyRows>) {
  return {
    entityType: preview.entityType,
    totalRows: preview.rows.length,
    validRows: preview.validRows,
    errorCount: preview.errors.length,
    warningCount: preview.warnings.length,
    skippedRows: preview.errors.map((error) => error.rowNumber)
  };
}

function normalizeStockyValue(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : undefined;
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
