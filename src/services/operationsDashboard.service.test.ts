import { describe, expect, it, vi } from "vitest";
import { getOperationsDashboard } from "./operationsDashboard.service";

describe("operationsDashboard.service", () => {
  it("aggregates returns, expiring batches, warehouse mismatches, and transfers", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      returnIntake: {
        findMany: vi.fn().mockResolvedValue([
          { id: "ret_1", quantity: 2, unitCost: 10, salesChannel: "Shopify", condition: "DEFECTIVE", product: { sku: "TEE-114", supplierRecord: { name: "Threadhouse" } } }
        ])
      },
      inventoryBatch: {
        findMany: vi.fn().mockResolvedValue([
          { id: "batch_1", quantityRemaining: 12, expiryDate: new Date(Date.now() + 20 * 86_400_000), product: { sku: "MUG-220" }, location: { name: "Retail" } }
        ])
      },
      threePLInventorySnapshot: {
        findMany: vi.fn().mockResolvedValue([
          { id: "snap_1", provider: "AMAZON_FBA", discrepancyQuantity: 4, status: "DISCREPANCY", fbaFee: 1.5, product: { sku: "TEE-114" } }
        ])
      },
      inventoryTransferSuggestion: {
        findMany: vi.fn().mockResolvedValue([{ id: "sug_1", urgencyScore: 88, lines: [] }])
      },
      inventoryTransfer: {
        findMany: vi.fn().mockResolvedValue([{ id: "tr_1", status: "IN_TRANSIT", lines: [{ quantity: 6 }] }])
      },
      locationReplenishmentRule: { findMany: vi.fn().mockResolvedValue([]) },
      supplierRma: { findMany: vi.fn().mockResolvedValue([{ id: "rma_1", status: "DRAFT", supplier: { name: "Threadhouse" } }]) }
    } as any;

    const dashboard = await getOperationsDashboard("shop_1", db);

    expect(dashboard.metrics).toMatchObject({
      returnUnits: 2,
      returnValue: 20,
      expiringUnits: 12,
      warehouseDiscrepancies: 1,
      discrepancyUnits: 4,
      transferSuggestions: 1,
      inTransitUnits: 6,
      openRmas: 1
    });
  });
});
