import { describe, expect, it, vi } from "vitest";
import {
  calculateVariance,
  countStocktakeLine,
  createStocktakeSession,
  getDiscrepancyInvestigation
} from "./stocktake.service";

function enabledDb(overrides: Record<string, unknown> = {}) {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    stocktakeSession: {
      create: vi.fn().mockResolvedValue({ id: "session_1" }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "session_1",
        varianceThresholdPercent: 5,
        varianceThresholdValue: 50
      })
    },
    stocktakeLine: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "line_1",
        expectedQuantity: 100,
        product: { cost: 3.5 }
      }),
      update: vi.fn().mockResolvedValue({ id: "line_1", varianceUnits: -8 })
    },
    inventoryMovement: {
      findMany: vi.fn().mockResolvedValue([
        { type: "SALE" },
        { type: "RECEIVING" },
        { type: "ADJUSTMENT" }
      ])
    },
    ...overrides
  } as any;
}

describe("stocktake.service", () => {
  it("calculates live variance bands", () => {
    expect(
      calculateVariance({
        expectedQuantity: 100,
        countedQuantity: 100,
        unitCost: 5,
        thresholdPercent: 5,
        thresholdValue: 50
      }).band
    ).toBe("match");

    expect(
      calculateVariance({
        expectedQuantity: 100,
        countedQuantity: 96,
        unitCost: 5,
        thresholdPercent: 5,
        thresholdValue: 50
      }).band
    ).toBe("warning");

    expect(
      calculateVariance({
        expectedQuantity: 100,
        countedQuantity: 80,
        unitCost: 5,
        thresholdPercent: 5,
        thresholdValue: 50
      }).band
    ).toBe("critical");
  });

  it("calculates stock count variance units, value, and percent when expected stock is zero", () => {
    expect(
      calculateVariance({
        expectedQuantity: 0,
        countedQuantity: 3,
        unitCost: 12.5,
        thresholdPercent: 5,
        thresholdValue: 50
      })
    ).toEqual({ units: 3, value: 37.5, percent: 100, band: "critical" });
  });

  it("creates sessions through the feature-gated service layer", async () => {
    const db = enabledDb();

    await createStocktakeSession(
      { shopId: "shop_1", name: "Q3 Cycle Count", mode: "CYCLE", blindCount: true },
      db
    );

    expect(db.stocktakeSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Q3 Cycle Count", blindCount: true })
      })
    );
  });

  it("updates counted lines with variance fields", async () => {
    const db = enabledDb();

    await countStocktakeLine(
      {
        shopId: "shop_1",
        sessionId: "session_1",
        productId: "product_1",
        countedQuantity: 92,
        countSource: "barcode"
      },
      db
    );

    expect(db.stocktakeLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          countedQuantity: 92,
          varianceUnits: -8,
          varianceValue: -28,
          variancePercent: -8
        })
      })
    );
  });

  it("returns the movement context needed for discrepancy review", async () => {
    const db = enabledDb();
    const result = await getDiscrepancyInvestigation("shop_1", "product_1", db);

    expect(result.lastReceiving?.type).toBe("RECEIVING");
    expect(result.lastAdjustment?.type).toBe("ADJUSTMENT");
  });
});
