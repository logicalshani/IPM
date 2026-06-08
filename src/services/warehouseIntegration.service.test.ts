import { describe, expect, it, vi } from "vitest";
import { buildThreePLWebhookSkeleton, handleThreePLReceivingConfirmation, recordThreePLInventorySnapshot } from "./warehouseIntegration.service";

describe("warehouseIntegration.service", () => {
  it("flags 3PL inventory discrepancies", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      threePLInventorySnapshot: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)) }
    } as any;
    const result = await recordThreePLInventorySnapshot(
      { shopId: "shop_1", productId: "p1", provider: "SHIPBOB", locationName: "3PL", externalSku: "SKU", threePLQuantity: 12, shopifyQuantity: 10 },
      db
    );
    expect(result.status).toBe("DISCREPANCY");
  });

  it("updates inventory when 3PL confirms receiving", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      productInventory: {
        findUnique: vi.fn().mockResolvedValue({ quantity: 5 }),
        upsert: vi.fn().mockResolvedValue({ quantity: 8 })
      }
    } as any;
    const result = await handleThreePLReceivingConfirmation(
      { shopId: "shop_1", productId: "p1", locationId: "loc_1", quantityReceived: 3, provider: "SHIPBOB" },
      db
    );
    expect(result.quantity).toBe(8);
  });

  it("returns connector webhook skeletons", () => {
    expect(buildThreePLWebhookSkeleton("AMAZON_FBA").endpoint).toBe("/api/operations/3pl/webhook");
  });
});
