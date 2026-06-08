import { describe, expect, it, vi } from "vitest";
import {
  calculateInvoiceAccuracy,
  getContractExpiryAlerts,
  optimizeVolumeDiscounts,
  saveSupplierPriceList
} from "./supplierPricing.service";

function enabledDb(overrides: Record<string, unknown> = {}) {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    supplierPriceListItem: {
      findMany: vi.fn().mockResolvedValue([])
    },
    supplierPriceList: {
      create: vi.fn().mockResolvedValue({ id: "pl_1", items: [] })
    },
    purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
    supplierContract: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides
  } as any;
}

describe("supplierPricing.service", () => {
  it("detects invoice accuracy inside tolerance", () => {
    expect(
      calculateInvoiceAccuracy(
        [
          { unitPrice: 10, invoiceUnitPrice: 10.05 },
          { unitPrice: 20, invoiceUnitPrice: 25 }
        ],
        1
      )
    ).toBe(50);
  });

  it("stores price lists and returns affected open POs", async () => {
    const db = enabledDb({
      supplierPriceListItem: {
        findMany: vi.fn().mockResolvedValue([{ sku: "TEE-1", unitPrice: 8, priceList: { effectiveFrom: new Date("2026-01-01") } }])
      },
      supplierPriceList: {
        create: vi.fn().mockResolvedValue({
          id: "pl_1",
          items: [{ sku: "TEE-1", priceChangePercent: 25 }]
        })
      },
      purchaseOrder: { findMany: vi.fn().mockResolvedValue([{ poNumber: "PO-1" }]) }
    });

    const result = await saveSupplierPriceList(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        name: "Q2 pricing",
        effectiveFrom: new Date("2026-04-01"),
        items: [{ sku: "TEE-1", moq: 50, unitPrice: 10, retailPrice: 28 }]
      },
      db
    );

    expect(result.affectedOpenPurchaseOrders).toHaveLength(1);
  });

  it("maps contracts into 30/60/90 day alerts", async () => {
    const db = enabledDb({
      supplierContract: {
        findMany: vi.fn().mockResolvedValue([
          { id: "contract_1", renewalDate: new Date(Date.now() + 20 * 86_400_000), supplier: { name: "Northline" } }
        ])
      }
    });

    const alerts = await getContractExpiryAlerts("shop_1", db);
    expect(alerts[0].alertWindowDays).toBe(30);
  });

  it("optimizes MOQ tiers within budget", async () => {
    const db = enabledDb({
      supplierPriceListItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            sku: "MUG-1",
            moq: 25,
            unitPrice: 5,
            priceList: { supplierId: "supplier_1", supplier: { name: "Kilnworks" } }
          },
          {
            sku: "MUG-1",
            moq: 1,
            unitPrice: 8,
            priceList: { supplierId: "supplier_1", supplier: { name: "Kilnworks" } }
          }
        ])
      }
    });

    const suggestions = await optimizeVolumeDiscounts({ shopId: "shop_1", budget: 200 }, db);
    expect(suggestions[0]).toMatchObject({ sku: "MUG-1", targetMoq: 25, estimatedSavings: 75 });
  });
});
