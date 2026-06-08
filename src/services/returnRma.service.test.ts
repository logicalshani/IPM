import { describe, expect, it, vi } from "vitest";
import { logReturnIntake, maybeDraftSupplierRma, recommendRestockingDecision } from "./returnRma.service";

function enabledDb(overrides: Record<string, unknown> = {}) {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    returnIntake: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ret_1", ...data })),
      findMany: vi.fn().mockResolvedValue([])
    },
    supplierRma: { create: vi.fn().mockResolvedValue({ id: "rma_1" }) },
    ...overrides
  } as any;
}

describe("returnRma.service", () => {
  it("recommends restocking decisions from condition, margin, and demand", () => {
    expect(recommendRestockingDecision({ condition: "RESELLABLE", margin: 12, returnRate: 2, demandScore: 70 }).decision).toBe("RESTOCK_NEW");
    expect(recommendRestockingDecision({ condition: "SUPPLIER_FAULT", margin: 50, returnRate: 12, demandScore: 70 }).decision).toBe("DISPOSE");
  });

  it("logs return intake with AI decision", async () => {
    const result = await logReturnIntake(
      { shopId: "shop_1", productId: "p1", condition: "DAMAGED", quantity: 1, unitCost: 10, margin: 30 },
      enabledDb()
    );
    expect(result.restockingDecision).toBe("RESTOCK_OPEN_BOX");
  });

  it("drafts supplier RMA when defect rate exceeds threshold", async () => {
    const db = enabledDb({
      returnIntake: {
        findMany: vi.fn().mockResolvedValue([
          { condition: "SUPPLIER_FAULT" },
          { condition: "DEFECTIVE" },
          { condition: "RESELLABLE" }
        ])
      }
    });
    await maybeDraftSupplierRma("shop_1", "supplier_1", db);
    expect(db.supplierRma.create).toHaveBeenCalled();
  });
});
