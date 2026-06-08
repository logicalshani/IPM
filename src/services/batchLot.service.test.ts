import { describe, expect, it, vi } from "vitest";
import { dispositionForExpiry, getFefoPickingSuggestions, recallBatch } from "./batchLot.service";

describe("batchLot.service", () => {
  it("classifies expiry disposition", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 20);
    expect(dispositionForExpiry(soon)).toBe("DISCOUNT");
  });

  it("builds FEFO picking suggestions", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      inventoryBatch: {
        findMany: vi.fn().mockResolvedValue([
          { id: "b1", batchNumber: "A", expiryDate: new Date("2026-07-01"), quantityRemaining: 4 },
          { id: "b2", batchNumber: "B", expiryDate: new Date("2026-08-01"), quantityRemaining: 10 }
        ])
      }
    } as any;
    const result = await getFefoPickingSuggestions({ shopId: "shop_1", productId: "p1", quantity: 7 }, db);
    expect(result.picks).toEqual([
      expect.objectContaining({ batchNumber: "A", quantity: 4 }),
      expect.objectContaining({ batchNumber: "B", quantity: 3 })
    ]);
  });

  it("returns recall notification list", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      inventoryBatch: {
        update: vi.fn().mockResolvedValue({
          batchNumber: "LOT-1",
          product: { sku: "MUG-1" },
          shipments: [{ orderName: "#1001", customerEmail: "a@example.com", quantity: 1 }]
        })
      }
    } as any;
    const result = await recallBatch({ shopId: "shop_1", batchId: "b1", reason: "Quality issue" }, db);
    expect(result.notificationList[0].message).toContain("Recall notice");
  });
});
