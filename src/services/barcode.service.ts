import type { BarcodeFormat, Prisma, PrismaClient } from "@prisma/client";
import bwipjs from "bwip-js";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export interface GenerateBarcodeInput {
  shopId: string;
  productId?: string;
  value: string;
  format: BarcodeFormat;
}

export async function generateBarcode(input: GenerateBarcodeInput, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.barcodeSystem, db);

  const imageData = await renderBarcode(input.format, input.value);

  return db.barcodeAsset.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      format: input.format,
      value: input.value,
      imageData
    }
  });
}

export async function batchGenerateProductBarcodes(
  input: { shopId: string; format: BarcodeFormat; category?: string; supplier?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.barcodeSystem, db);

  const products = await db.product.findMany({
    where: {
      shopId: input.shopId,
      category: input.category,
      supplier: input.supplier
    },
    orderBy: { sku: "asc" }
  });

  const assets = [];
  for (const product of products) {
    const value = product.barcode ?? product.sku;
    assets.push(
      await generateBarcode(
        { shopId: input.shopId, productId: product.id, format: input.format, value },
        db
      )
    );
  }

  return assets;
}

export async function saveBarcodeTemplate(
  input: {
    shopId: string;
    name: string;
    widthMm: number;
    heightMm: number;
    fields: Prisma.InputJsonValue;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.barcodeSystem, db);

  return db.barcodeTemplate.upsert({
    where: { shopId_name: { shopId: input.shopId, name: input.name } },
    create: input,
    update: {
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      fields: input.fields
    }
  });
}

export async function recordReceivingScan(
  input: {
    shopId: string;
    purchaseOrderId: string;
    productId: string;
    scannedQuantity: number;
    expectedQuantity: number;
    damagedQuantity?: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.barcodeSystem, db);

  const overReceived = input.scannedQuantity > input.expectedQuantity;
  const damaged = input.damagedQuantity ?? 0;

  await db.inventoryMovement.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      type: damaged > 0 ? "DAMAGE" : "RECEIVING",
      quantity: input.scannedQuantity - damaged,
      unitCost: 0,
      reference: input.purchaseOrderId,
      notes: overReceived ? "Over-received during barcode receiving" : undefined
    }
  });

  return {
    acceptedQuantity: Math.max(input.scannedQuantity - damaged, 0),
    overReceived,
    damagedQuantity: damaged
  };
}

export async function verifyTransferScan(
  input: {
    shopId: string;
    transferId: string;
    originProductIds: string[];
    destinationProductIds: string[];
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.barcodeSystem, db);

  const destination = new Set(input.destinationProductIds);
  const missing = input.originProductIds.filter((id) => !destination.has(id));
  const unexpected = input.destinationProductIds.filter((id) => !input.originProductIds.includes(id));

  return {
    transferId: input.transferId,
    matched: missing.length === 0 && unexpected.length === 0,
    missing,
    unexpected
  };
}

async function renderBarcode(format: BarcodeFormat, value: string) {
  if (format === "QR_CODE") {
    return QRCode.toDataURL(value, { margin: 1, width: 320 });
  }

  const barcodeType =
    format === "EAN_13" ? "ean13" : format === "DATA_MATRIX" ? "datamatrix" : "code128";
  const png = await bwipjs.toBuffer({
    bcid: barcodeType,
    text: value,
    scale: 3,
    height: 10,
    includetext: format !== "DATA_MATRIX"
  });

  return `data:image/png;base64,${png.toString("base64")}`;
}
