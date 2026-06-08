import { describe, expect, it, vi } from "vitest";
import {
  buildDelayDistribution,
  calculateSupplierReliability,
  recordPurchaseOrderEvidence,
  upsertSupplier,
  upsertLeadTimeProfile
} from "./supplierLeadTime.service";

function enabledDb(overrides: Record<string, unknown> = {}) {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    supplier: {
      upsert: vi.fn().mockResolvedValue({ id: "supplier_1" }),
      findUnique: vi.fn().mockResolvedValue({ reliabilityScore: 72 }),
      update: vi.fn().mockResolvedValue({ id: "supplier_1" })
    },
    supplierCategoryLeadTime: {
      upsert: vi.fn().mockResolvedValue({ id: "lt_1" }),
      findUnique: vi.fn().mockResolvedValue({ averageDays: 10 })
    },
    purchaseOrder: {
      upsert: vi.fn().mockResolvedValue({ id: "po_1", lines: [] }),
      findMany: vi.fn().mockResolvedValue([])
    },
    supplierSeasonalRiskPeriod: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides
  } as any;
}

describe("supplierLeadTime.service", () => {
  it("upserts supplier directory records", async () => {
    const db = enabledDb();

    await upsertSupplier({ shopId: "shop_1", name: "Northline", email: "ops@northline.test" }, db);

    expect(db.supplier.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId_name: { shopId: "shop_1", name: "Northline" } } })
    );
  });

  it("calculates weighted supplier reliability", () => {
    const score = calculateSupplierReliability([
      {
        promisedDeliveryDate: new Date("2026-01-10"),
        actualDeliveryDate: new Date("2026-01-10"),
        deliveryDeltaDays: 0,
        invoiceAccurate: true,
        lines: [{ orderedQuantity: 100, receivedQuantity: 100 }]
      },
      {
        promisedDeliveryDate: new Date("2026-02-10"),
        actualDeliveryDate: new Date("2026-02-13"),
        deliveryDeltaDays: 3,
        invoiceAccurate: false,
        lines: [{ orderedQuantity: 100, receivedQuantity: 80 }]
      }
    ]);

    expect(score).toEqual({ onTimeRate: 50, fillRate: 90, invoiceAccuracy: 50, reliabilityScore: 62 });
  });

  it("returns a zero supplier reliability score with no PO evidence", () => {
    expect(calculateSupplierReliability([])).toEqual({ onTimeRate: 0, fillRate: 0, invoiceAccuracy: 0, reliabilityScore: 0 });
  });

  it("stores lead-time profiles with dynamic estimates", async () => {
    const db = enabledDb();

    await upsertLeadTimeProfile(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        category: "Apparel",
        minimumDays: 7,
        maximumDays: 21,
        averageDays: 12,
        bufferDays: 3
      },
      db
    );

    expect(db.supplierCategoryLeadTime.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ dynamicEstimateDays: 15 })
      })
    );
  });

  it("records PO delivery evidence and refreshes performance", async () => {
    const db = enabledDb();

    await recordPurchaseOrderEvidence(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        poNumber: "PO-1001",
        promisedDeliveryDate: new Date("2026-03-10"),
        actualDeliveryDate: new Date("2026-03-12"),
        invoiceAccurate: true,
        lines: [
          {
            sku: "TEE-1",
            category: "Apparel",
            orderedQuantity: 10,
            receivedQuantity: 9,
            unitPrice: 8
          }
        ]
      },
      db
    );

    expect(db.purchaseOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ deliveryDeltaDays: 2, status: "RECEIVED" })
      })
    );
    expect(db.supplier.update).toHaveBeenCalled();
  });

  it("builds delay buckets for dashboard histograms", () => {
    expect(buildDelayDistribution([{ deliveryDeltaDays: 0 }, { deliveryDeltaDays: 1 }, { deliveryDeltaDays: 15 }])).toEqual([
      { label: "On time", count: 1 },
      { label: "1 day", count: 1 },
      { label: "2-3 days", count: 0 },
      { label: "1 week", count: 0 },
      { label: "2+ weeks", count: 1 }
    ]);
  });
});
