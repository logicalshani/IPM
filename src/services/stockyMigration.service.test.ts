import { describe, expect, it, vi } from "vitest";
import { createMigrationJob, mapStockyRow, queueMigrationJob, rollbackMigrationJob, validateStockyRows } from "./stockyMigration.service";

describe("stockyMigration.service", () => {
  it("maps Stocky columns into IMP fields", () => {
    const mapped = mapStockyRow({ SKU: " TEE-114 ", Supplier: "" }, { SKU: "sku", Supplier: "supplierName" });
    expect(mapped).toEqual({ sku: "TEE-114", supplierName: undefined });
  });

  it("validates missing required fields, duplicate SKUs, blank suppliers, and Stocky quirks", () => {
    const preview = validateStockyRows(
      "PRODUCTS",
      [
        { "Stocky SKU": "TEE-114", Name: "Core Tee", Supplier: "", "Variant Option": "Size / Color", "Location: Warehouse": "12" },
        { "Stocky SKU": "TEE-114", Name: "Duplicate Tee", Supplier: "Threadhouse" },
        { "Stocky SKU": "", Name: "No SKU" }
      ],
      { "Stocky SKU": "sku", Name: "name", Supplier: "supplierName" }
    );

    expect(preview.canImport).toBe(false);
    expect(preview.errors).toContainEqual(expect.objectContaining({ field: "sku" }));
    expect(preview.warnings.map((warning) => warning.message).join(" ")).toContain("Duplicate SKU");
    expect(preview.warnings.map((warning) => warning.message).join(" ")).toContain("Blank Stocky supplier");
    expect(preview.warnings.map((warning) => warning.message).join(" ")).toContain("Split variant row");
    expect(preview.warnings.map((warning) => warning.message).join(" ")).toContain("Multi-location");
  });

  it("creates dry-run migration jobs with validation summary and progress log", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      migrationJob: { create: vi.fn().mockResolvedValue({ id: "job_1" }) },
      migrationLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;

    const result = await createMigrationJob(
      {
        shopId: "shop_1",
        entityType: "SUPPLIERS",
        fieldMapping: { Supplier: "name" },
        rows: [{ Supplier: "Northline" }],
        dryRun: true
      },
      db
    );

    expect(result.preview.canImport).toBe(true);
    expect(db.migrationJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dryRun: true, status: "READY" }) }));
    expect(db.migrationLog.create).toHaveBeenCalled();
  });

  it("marks migration jobs running and rolled back", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      migrationJob: {
        update: vi.fn().mockResolvedValue({ id: "job_1", rollbackToken: "rollback_1" })
      },
      migrationLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;

    await expect(queueMigrationJob("job_1", "shop_1", db)).resolves.toMatchObject({ jobId: "job_1" });
    await expect(rollbackMigrationJob("job_1", "shop_1", db)).resolves.toMatchObject({ job: { id: "job_1" } });
    expect(db.migrationJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RUNNING" }) }));
    expect(db.migrationJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ROLLED_BACK" }) }));
  });
});
