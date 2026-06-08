import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type ExtractedInvoice = {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  total: number;
  lines: Array<{ sku: string; description: string; quantity: number; unitPrice: number; total: number }>;
};

export async function storeParsedInvoice(
  input: {
    shopId: string;
    purchaseOrderId?: string;
    sourceFileName?: string;
    extracted: ExtractedInvoice;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.invoiceParser, db);

  const match = input.purchaseOrderId
    ? await matchInvoiceToPurchaseOrder(input.shopId, input.purchaseOrderId, input.extracted, db)
    : { lines: input.extracted.lines.map((line) => ({ ...line, discrepancyType: "UNMATCHED_PO", discrepancyNote: "No PO selected" })), summary: { unmatched: input.extracted.lines.length } };

  return db.parsedInvoice.upsert({
    where: { shopId_invoiceNumber: { shopId: input.shopId, invoiceNumber: input.extracted.invoiceNumber } },
    create: {
      shopId: input.shopId,
      purchaseOrderId: input.purchaseOrderId,
      supplierName: input.extracted.supplierName,
      invoiceNumber: input.extracted.invoiceNumber,
      invoiceDate: input.extracted.invoiceDate ? new Date(input.extracted.invoiceDate) : undefined,
      dueDate: input.extracted.dueDate ? new Date(input.extracted.dueDate) : undefined,
      paymentTerms: input.extracted.paymentTerms,
      total: input.extracted.total,
      subtotal: input.extracted.lines.reduce((sum, line) => sum + line.total, 0),
      sourceFileName: input.sourceFileName,
      rawExtractedJson: input.extracted as unknown as Prisma.InputJsonValue,
      discrepancySummary: match.summary as Prisma.InputJsonValue,
      status: Object.keys(match.summary).length === 0 ? "MATCHED" : "FLAGGED",
      lines: {
        create: match.lines.map((line) => ({
          sku: line.sku,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          discrepancyType: line.discrepancyType,
          discrepancyNote: line.discrepancyNote
        }))
      }
    },
    update: {
      purchaseOrderId: input.purchaseOrderId,
      supplierName: input.extracted.supplierName,
      invoiceDate: input.extracted.invoiceDate ? new Date(input.extracted.invoiceDate) : undefined,
      dueDate: input.extracted.dueDate ? new Date(input.extracted.dueDate) : undefined,
      paymentTerms: input.extracted.paymentTerms,
      total: input.extracted.total,
      rawExtractedJson: input.extracted as unknown as Prisma.InputJsonValue,
      discrepancySummary: match.summary as Prisma.InputJsonValue,
      status: Object.keys(match.summary).length === 0 ? "MATCHED" : "FLAGGED"
    },
    include: { lines: true }
  });
}

export async function matchInvoiceToPurchaseOrder(
  shopId: string,
  purchaseOrderId: string,
  extracted: ExtractedInvoice,
  db: PrismaClient = prisma
) {
  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId, shopId },
    include: { lines: true }
  });
  const summary: Record<string, number> = {};
  const lines = extracted.lines.map((line) => {
    const poLine = po.lines.find((candidate) => candidate.sku === line.sku);
    if (!poLine) {
      summary.missingSku = (summary.missingSku ?? 0) + 1;
      return { ...line, discrepancyType: "MISSING_SKU", discrepancyNote: "SKU not found on PO" };
    }
    if (poLine.orderedQuantity !== line.quantity) {
      summary.qtyMismatch = (summary.qtyMismatch ?? 0) + 1;
      return { ...line, discrepancyType: "QTY_MISMATCH", discrepancyNote: `PO qty ${poLine.orderedQuantity}, invoice qty ${line.quantity}` };
    }
    if (Math.abs(Number(poLine.unitPrice) - line.unitPrice) > 0.01) {
      summary.priceMismatch = (summary.priceMismatch ?? 0) + 1;
      return { ...line, discrepancyType: "PRICE_MISMATCH", discrepancyNote: `PO price ${poLine.unitPrice}, invoice price ${line.unitPrice}` };
    }
    return { ...line, discrepancyType: undefined, discrepancyNote: undefined };
  });

  return { lines, summary };
}

export async function approveParsedInvoice(input: { shopId: string; invoiceId: string }, db: PrismaClient = prisma) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.invoiceParser, db);

  const invoice = await db.parsedInvoice.findUniqueOrThrow({
    where: { id: input.invoiceId, shopId: input.shopId },
    include: { purchaseOrder: true }
  });
  if (invoice.purchaseOrderId) {
    await db.purchaseOrder.update({
      where: { id: invoice.purchaseOrderId, shopId: input.shopId },
      data: { status: "RECEIVED", actualDeliveryDate: invoice.purchaseOrder?.actualDeliveryDate ?? new Date() }
    });
  }

  return db.parsedInvoice.update({
    where: { id: input.invoiceId, shopId: input.shopId },
    data: { status: "APPROVED" }
  });
}

export function exportInvoiceAccountingRows(invoice: ExtractedInvoice, format: "quickbooks_iif" | "xero_csv") {
  if (format === "quickbooks_iif") {
    return [
      "!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM",
      ...invoice.lines.map((line) => `TRNS\tBILL\t${invoice.invoiceDate ?? ""}\tAccounts Payable\t${invoice.supplierName}\t${line.total}\t${invoice.invoiceNumber}`)
    ].join("\n");
  }
  return ["Supplier,Invoice Number,SKU,Description,Quantity,Unit Price,Total", ...invoice.lines.map((line) => `${invoice.supplierName},${invoice.invoiceNumber},${line.sku},${line.description},${line.quantity},${line.unitPrice},${line.total}`)].join("\n");
}

export function parseInvoiceTextFallback(text: string): ExtractedInvoice {
  const invoiceNumber = text.match(/invoice\s*#?:?\s*([A-Z0-9-]+)/i)?.[1] ?? `INV-${Date.now()}`;
  const supplierName = text.match(/supplier:?\s*(.+)/i)?.[1]?.trim() ?? "Unknown supplier";
  return {
    supplierName,
    invoiceNumber,
    total: Number(text.match(/total:?\s*\$?([0-9.]+)/i)?.[1] ?? 0),
    lines: []
  };
}
