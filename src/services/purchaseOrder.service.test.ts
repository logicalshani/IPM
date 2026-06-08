import { describe, expect, it, vi } from "vitest";
import {
  approvalPolicyForAmount,
  assertPurchaseOrderTransition,
  calculateReorderPoint,
  canTransitionPurchaseOrderStatus,
  applyLandedCosts,
  chooseSupplierForProduct,
  createPurchaseOrderDraft,
  receivePurchaseOrderLine,
  recommendBackorderAction,
  threeWayMatchPurchaseOrder,
  transitionPurchaseOrderStatus
} from "./purchaseOrder.service";

function enabledDb(overrides: Record<string, unknown> = {}) {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    purchaseOrder: {
      create: vi.fn().mockResolvedValue({ id: "po_1", lines: [{ orderedQuantity: 10, unitPrice: 20 }], supplier: { name: "Northline" } }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "po_1", lines: [{ id: "line_1", orderedQuantity: 10, unitPrice: 20 }], freightCost: 0, customsCost: 0, handlingCost: 0 }),
      update: vi.fn().mockResolvedValue({ id: "po_1" })
    },
    purchaseOrderApproval: {
      create: vi.fn().mockResolvedValue({ id: "approval_1" }),
      findFirst: vi.fn().mockResolvedValue({ id: "approval_1" }),
      update: vi.fn().mockResolvedValue({ id: "approval_1" })
    },
    purchaseOrderLine: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "line_1",
        sku: "TEE-1",
        orderedQuantity: 10,
        receivedQuantity: 0,
        unitPrice: 20,
        purchaseOrder: { supplierId: "supplier_1" }
      }),
      update: vi.fn().mockResolvedValue({ id: "line_1" })
    },
    backorderReminder: { create: vi.fn().mockResolvedValue({ id: "bo_1" }) },
    supplierCommunication: { create: vi.fn().mockResolvedValue({ id: "comm_1" }) },
    ...overrides
  } as any;
}

describe("purchaseOrder.service", () => {
  it("selects approval tiers by amount", () => {
    expect(approvalPolicyForAmount(499).autoApprove).toBe(true);
    expect(approvalPolicyForAmount(1200).role).toBe("MANAGER");
    expect(approvalPolicyForAmount(7000).role).toBe("OWNER");
  });

  it("calculates reorder points with and without seasonal adjustment", () => {
    expect(calculateReorderPoint({ dailyDemand: 4.2, leadTimeDays: 10, safetyStockDays: 5 })).toBe(63);
    expect(calculateReorderPoint({ dailyDemand: 4.2, leadTimeDays: 10, safetyStockDays: 5, seasonalBufferDays: 7 })).toBe(93);
    expect(calculateReorderPoint({ dailyDemand: 0, leadTimeDays: 10, safetyStockDays: 5, minimumOrderPoint: 12 })).toBe(12);
  });

  it("scores multi-supplier options by price, reliability, and lead time", () => {
    const choice = chooseSupplierForProduct({
      options: [
        { supplierId: "slow", unitPrice: 4, reliabilityScore: 50, leadTimeDays: 30, moq: 1 },
        { supplierId: "fast", unitPrice: 5, reliabilityScore: 90, leadTimeDays: 7, moq: 1 }
      ]
    });
    expect(choice?.supplierId).toBe("fast");
  });

  it("enforces the PO approval workflow state machine", async () => {
    expect(canTransitionPurchaseOrderStatus("DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(canTransitionPurchaseOrderStatus("APPROVED", "SENT_TO_SUPPLIER")).toBe(true);
    expect(canTransitionPurchaseOrderStatus("CLOSED", "APPROVED")).toBe(false);
    expect(() => assertPurchaseOrderTransition("CLOSED", "APPROVED")).toThrow("Invalid purchase order transition CLOSED -> APPROVED");

    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "APPROVED" }),
        update: vi.fn().mockResolvedValue({ status: "SENT_TO_SUPPLIER" })
      }
    });

    await expect(transitionPurchaseOrderStatus({ shopId: "shop_1", purchaseOrderId: "po_1", status: "SENT_TO_SUPPLIER" }, db)).resolves.toMatchObject({
      status: "SENT_TO_SUPPLIER"
    });
  });

  it("rejects invalid PO workflow transitions before writing", async () => {
    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ status: "CLOSED" }),
        update: vi.fn()
      }
    });

    await expect(transitionPurchaseOrderStatus({ shopId: "shop_1", purchaseOrderId: "po_1", status: "APPROVED" }, db)).rejects.toThrow(
      "Invalid purchase order transition CLOSED -> APPROVED"
    );
    expect(db.purchaseOrder.update).not.toHaveBeenCalled();
  });

  it("creates drafts and routes approval", async () => {
    const db = enabledDb();
    await createPurchaseOrderDraft(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        lines: [{ sku: "TEE-1", category: "Apparel", orderedQuantity: 10, unitPrice: 20 }]
      },
      db
    );
    expect(db.purchaseOrder.create).toHaveBeenCalled();
    expect(db.purchaseOrderApproval.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "AUTO_APPROVED" }) })
    );
  });

  it("tracks partial receiving and backorder reminder", async () => {
    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          lines: [{ id: "line_1", orderedQuantity: 10, receivedQuantity: 0 }],
          supplier: { name: "Northline" }
        }),
        update: vi.fn().mockResolvedValue({ status: "PARTIALLY_RECEIVED" })
      }
    });
    const result = await receivePurchaseOrderLine(
      { shopId: "shop_1", purchaseOrderId: "po_1", lineId: "line_1", receivedQuantity: 6 },
      db
    );
    expect(result.status).toBe("PARTIALLY_RECEIVED");
    expect(db.backorderReminder.create).toHaveBeenCalled();
  });

  it("recalculates landed unit cost and margin", async () => {
    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          lines: [{ id: "line_1", orderedQuantity: 10, unitPrice: 10, product: { price: 25 } }]
        }),
        update: vi.fn().mockResolvedValue({ landedTotal: 130 })
      }
    });
    await applyLandedCosts({ shopId: "shop_1", purchaseOrderId: "po_1", freightCost: 20, customsCost: 10 }, db);
    expect(db.purchaseOrderLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ landedUnitCost: 13, marginAfterLandedCost: 12 }) })
    );
  });

  it("flags three-way match mismatches before close", async () => {
    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          lines: [{ sku: "TEE-1", orderedQuantity: 10, receivedQuantity: 8, unitPrice: 10 }],
          parsedInvoices: [{ lines: [{ sku: "TEE-1", quantity: 10, unitPrice: 10 }] }]
        }),
        update: vi.fn().mockResolvedValue({ status: "DISPUTED" })
      }
    });
    const result = await threeWayMatchPurchaseOrder("shop_1", "po_1", db);
    expect(result.status).toBe("DISPUTED");
  });

  it("closes POs when three-way match validation passes", async () => {
    const db = enabledDb({
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          lines: [{ sku: "TEE-1", orderedQuantity: 10, receivedQuantity: 10, unitPrice: 10 }],
          parsedInvoices: [{ lines: [{ sku: "TEE-1", quantity: 10, unitPrice: 10 }] }]
        }),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ status: data.status, threeWayMatchJson: data.threeWayMatchJson, closedAt: data.closedAt }))
      }
    });

    const result = await threeWayMatchPurchaseOrder("shop_1", "po_1", db);

    expect(result.status).toBe("CLOSED");
    expect(result.threeWayMatchJson).toEqual({ mismatches: [] });
    expect(result.closedAt).toBeInstanceOf(Date);
  });

  it("recommends backorder actions", () => {
    expect(
      recommendBackorderAction({
        backorderedQuantity: 50,
        orderedQuantity: 100,
        supplierReliabilityScore: 90,
        alternateSupplierAvailable: false
      }).recommendation
    ).toBe("ADJUST_SHOPIFY_AVAILABILITY");
  });
});
