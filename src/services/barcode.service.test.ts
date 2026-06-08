import { describe, expect, it, vi } from "vitest";
import {
  batchGenerateProductBarcodes,
  recordReceivingScan,
  saveBarcodeTemplate,
  verifyTransferScan
} from "./barcode.service";

vi.mock("bwip-js", () => ({
  default: { toBuffer: vi.fn().mockResolvedValue(Buffer.from("barcode")) }
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") }
}));

function enabledDb() {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: "p1", sku: "SKU-1", barcode: null },
        { id: "p2", sku: "SKU-2", barcode: "0123456789012" }
      ])
    },
    barcodeAsset: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: `asset_${data.value}`, ...data }))
    },
    barcodeTemplate: {
      upsert: vi.fn().mockResolvedValue({ id: "template_1" })
    },
    inventoryMovement: {
      create: vi.fn().mockResolvedValue({ id: "movement_1" })
    }
  } as any;
}

describe("barcode.service", () => {
  it("batch-generates barcode assets for filtered products", async () => {
    const db = enabledDb();

    const assets = await batchGenerateProductBarcodes({ shopId: "shop_1", format: "CODE_128" }, db);

    expect(assets).toHaveLength(2);
    expect(db.barcodeAsset.create).toHaveBeenCalledTimes(2);
  });

  it("saves drag-and-drop label templates", async () => {
    const db = enabledDb();

    await saveBarcodeTemplate(
      {
        shopId: "shop_1",
        name: "Shelf label",
        widthMm: 60,
        heightMm: 30,
        fields: [{ id: "sku", x: 4, y: 4 }]
      },
      db
    );

    expect(db.barcodeTemplate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId_name: { shopId: "shop_1", name: "Shelf label" } } })
    );
  });

  it("detects over-receiving and damaged goods", async () => {
    const db = enabledDb();

    const result = await recordReceivingScan(
      {
        shopId: "shop_1",
        purchaseOrderId: "po_1",
        productId: "p1",
        scannedQuantity: 12,
        expectedQuantity: 10,
        damagedQuantity: 1
      },
      db
    );

    expect(result).toMatchObject({ overReceived: true, damagedQuantity: 1, acceptedQuantity: 11 });
  });

  it("flags missing transfer destination scans", async () => {
    const result = await verifyTransferScan(
      {
        shopId: "shop_1",
        transferId: "tr_1",
        originProductIds: ["p1", "p2"],
        destinationProductIds: ["p1"]
      },
      enabledDb()
    );

    expect(result.matched).toBe(false);
    expect(result.missing).toEqual(["p2"]);
  });
});
