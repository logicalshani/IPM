import { describe, expect, it, vi } from "vitest";
import { exportInvoiceAccountingRows, matchInvoiceToPurchaseOrder, parseInvoiceTextFallback } from "./invoiceParser.service";

describe("invoiceParser.service", () => {
  it("flags price and quantity discrepancies against a PO", async () => {
    const db = {
      purchaseOrder: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          lines: [{ sku: "TEE-1", orderedQuantity: 10, unitPrice: 8 }]
        })
      }
    } as any;

    const result = await matchInvoiceToPurchaseOrder(
      "shop_1",
      "po_1",
      {
        supplierName: "Threadhouse",
        invoiceNumber: "INV-1",
        total: 100,
        lines: [{ sku: "TEE-1", description: "Tee", quantity: 12, unitPrice: 9, total: 108 }]
      },
      db
    );

    expect(result.summary.qtyMismatch).toBe(1);
  });

  it("exports invoice lines to accounting CSV", () => {
    const csv = exportInvoiceAccountingRows(
      {
        supplierName: "Threadhouse",
        invoiceNumber: "INV-1",
        total: 80,
        lines: [{ sku: "TEE-1", description: "Tee", quantity: 10, unitPrice: 8, total: 80 }]
      },
      "xero_csv"
    );
    expect(csv).toContain("Supplier,Invoice Number");
  });

  it("extracts fallback invoice number from text", () => {
    expect(parseInvoiceTextFallback("Supplier: Northline\nInvoice # INV-55\nTotal: 120").invoiceNumber).toBe("INV-55");
  });
});
