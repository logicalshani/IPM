import { describe, expect, it, vi } from "vitest";
import {
  REPORT_DEFINITIONS,
  buildQuickBooksJournalCsv,
  buildReportCsv,
  calculateInventoryHealthScore,
  getReportLibrary,
  saveCustomReport
} from "./reporting.service";

describe("reporting.service", () => {
  it("defines the full phase 7 standard report library", () => {
    expect(REPORT_DEFINITIONS).toHaveLength(16);
    expect(REPORT_DEFINITIONS.map((report) => report.key)).toContain("inventory-valuation");
    expect(REPORT_DEFINITIONS.map((report) => report.key)).toContain("batch-expiry");
  });

  it("clamps inventory health score to 0-100", () => {
    expect(calculateInventoryHealthScore(120)).toBe(100);
    expect(calculateInventoryHealthScore(-4)).toBe(0);
    expect(calculateInventoryHealthScore(74.4)).toBe(74);
  });

  it("builds CSV and QuickBooks-compatible journal export rows", () => {
    const report = { rows: [{ sku: "TEE-114", value: 1200, units: 40 }] };
    expect(buildReportCsv(report)).toContain("sku,value,units");
    expect(buildQuickBooksJournalCsv(report)).toContain("GENERAL JOURNAL");
    expect(buildQuickBooksJournalCsv(report)).toContain("Inventory Asset");
  });

  it("loads report library through feature-gated service layer", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      customReport: { findMany: vi.fn().mockResolvedValue([{ name: "Owner view" }]) },
      scheduledReport: { findMany: vi.fn().mockResolvedValue([{ recipientEmail: "owner@example.com" }]) }
    } as any;

    const library = await getReportLibrary("shop_1", db);
    expect(library.reports.length).toBeGreaterThan(10);
    expect(library.customReports).toHaveLength(1);
    expect(library.scheduledReports).toHaveLength(1);
  });

  it("saves custom reports with dimensions and metrics through Prisma upsert", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      customReport: { upsert: vi.fn().mockResolvedValue({ id: "report_1" }) }
    } as any;

    await saveCustomReport(
      {
        shopId: "shop_1",
        name: "Weekly report",
        dimensions: ["SKU"],
        metrics: ["Value"],
        visualization: "BAR"
      },
      db
    );

    expect(db.customReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_name: { shopId: "shop_1", name: "Weekly report" } }
      })
    );
  });
});
