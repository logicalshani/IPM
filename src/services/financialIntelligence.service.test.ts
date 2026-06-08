import { describe, expect, it, vi } from "vitest";
import {
  buildShrinkageCsv,
  calculateCashConversionCycle,
  calculateInventoryValue,
  parsePaymentTerms,
  projectInventoryCashFlow,
  recordInventoryAdjustment
} from "./financialIntelligence.service";

describe("financialIntelligence.service", () => {
  it("parses supplier payment terms", () => {
    expect(parsePaymentTerms("Net 60")).toBe(60);
    expect(parsePaymentTerms("50% deposit, Net 15 on delivery")).toBe(15);
    expect(parsePaymentTerms("Due on receipt")).toBe(0);
  });

  it("calculates cash conversion cycle", () => {
    expect(
      calculateCashConversionCycle({
        inventoryValue: 12000,
        cogsPeriod: 6000,
        periodDays: 30,
        dso: 3,
        dpo: 30
      })
    ).toEqual({ dio: 60, dso: 3, dpo: 30, cashConversionCycle: 33 });
  });

  it("projects 30/60/90 day inventory cash needs from open POs and sales velocity", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      financialSettings: {
        findUnique: vi.fn().mockResolvedValue({
          valuationMethod: "FIFO",
          workingCapitalThreshold: 500,
          industryDioBenchmark: 60,
          industryDsoBenchmark: 7,
          industryDpoBenchmark: 30,
          defaultDsoDays: 5
        }),
        create: vi.fn()
      },
      purchaseOrder: {
        findMany: vi.fn().mockResolvedValue([
          {
            orderedAt: new Date(),
            supplier: { paymentTerms: "Net 30" },
            lines: [{ orderedQuantity: 100, unitPrice: 10 }],
            freightCost: 25,
            customsCost: 0,
            handlingCost: 0
          }
        ])
      },
      product: {
        findMany: vi.fn().mockResolvedValue([{ cost: 4, inventory: [{ quantity: 50 }] }])
      },
      inventoryMovement: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ quantity: -30, product: { price: 10 } }])
          .mockResolvedValueOnce([{ quantity: -40, unitCost: 4 }])
      }
    } as any;

    const result = await projectInventoryCashFlow("shop_1", db);

    expect(result.projected[0]).toMatchObject({
      horizonDays: 30,
      inventoryCashNeeded: 1025,
      expectedSalesCashIn: 300,
      netInventoryCashPosition: -725
    });
    expect(result.workingCapitalAlert).toMatchObject({ type: "WORKING_CAPITAL", amount: 1025, threshold: 500 });
    expect(result.cashConversionCycle.cashConversionCycle).toBeGreaterThan(0);
  });

  it("calculates FIFO, LIFO, and weighted average valuation", () => {
    const layers = [
      { quantityRemaining: 10, unitCost: 5, receivedAt: new Date("2026-01-01") },
      { quantityRemaining: 10, unitCost: 7, receivedAt: new Date("2026-02-01") }
    ];

    expect(calculateInventoryValue(layers, "FIFO")).toBe(120);
    expect(calculateInventoryValue(layers, "LIFO")).toBe(120);
    expect(calculateInventoryValue(layers, "WEIGHTED_AVERAGE")).toBe(120);
  });

  it("records adjustments and matching inventory movement through service layer", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      inventoryMovement: { create: vi.fn().mockResolvedValue({ id: "move_1" }) },
      inventoryAdjustment: { create: vi.fn().mockResolvedValue({ id: "adj_1", valueLost: 45 }) }
    } as any;

    await recordInventoryAdjustment(
      {
        shopId: "shop_1",
        productId: "p1",
        reason: "DAMAGED",
        quantity: 3,
        unitCost: 15
      },
      db
    );

    expect(db.inventoryAdjustment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ valueLost: 45, quantity: -3 }) })
    );
    expect(db.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DAMAGE", quantity: -3 }) })
    );
  });

  it("builds tax-ready shrinkage CSV", () => {
    const csv = buildShrinkageCsv({
      month: "2026-06-01T00:00:00.000Z",
      unitsLost: 4,
      valueLost: 80,
      revenue: 1000,
      shrinkagePercentOfRevenue: 8,
      byReason: [{ key: "DAMAGED", units: 4, value: 80 }],
      byLocation: [],
      byCategory: [],
      byStaff: []
    });

    expect(csv).toContain("Month,Units Lost,Value Lost");
    expect(csv).toContain("DAMAGED,4,80");
  });
});
