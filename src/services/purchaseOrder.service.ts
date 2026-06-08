import type { Prisma, PrismaClient, PurchaseOrderStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { purchaseOrderQueue } from "@/lib/redis";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";
import { logSupplierCommunication } from "./supplierCommunication.service";

export type PurchaseOrderLineInput = {
  productId?: string;
  sku: string;
  category: string;
  orderedQuantity: number;
  unitPrice: number;
};

export async function createPurchaseOrderDraft(
  input: {
    shopId: string;
    supplierId: string;
    poNumber?: string;
    lines: PurchaseOrderLineInput[];
    notes?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const subtotal = sumLines(input.lines);
  const po = await db.purchaseOrder.create({
    data: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      poNumber: input.poNumber ?? `PO-${Date.now()}`,
      status: "DRAFT",
      subtotal,
      expectedTotal: subtotal,
      landedTotal: subtotal,
      notes: input.notes,
      lines: { create: input.lines }
    },
    include: { lines: true, supplier: true }
  });

  return routePurchaseOrderApproval(input.shopId, po.id, db);
}

export async function generateNightlyPurchaseOrderDrafts(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.purchaseOrders, db);

  const products = await db.product.findMany({
    where: { shopId },
    include: {
      inventory: true,
      demandProfile: true,
      supplierRecord: { include: { leadTimes: true } },
      sourcingOptions: { include: { supplier: true }, where: { active: true } }
    }
  });

  const bySupplier = new Map<string, PurchaseOrderLineInput[]>();
  for (const product of products) {
    const quantityOnHand = product.inventory.reduce((sum, row) => sum + row.quantity, 0);
    const dailyDemand = Number(product.demandProfile?.baselineDailyDemand ?? product.demandProfile?.merchantProxyDemand ?? 0.1);
    const defaultLeadTime = Number(product.supplierRecord?.leadTimes.find((leadTime) => leadTime.category === product.category)?.dynamicEstimateDays ?? 14);
    const daysOfStock = quantityOnHand / Math.max(dailyDemand, 0.1);
    const reorderTrigger = defaultLeadTime + 7;
    if (daysOfStock >= reorderTrigger) continue;

    const supplierChoice = chooseSupplierForProduct({
      defaultSupplierId: product.supplierId,
      options: product.sourcingOptions.map((option) => ({
        supplierId: option.supplierId,
        unitPrice: Number(option.unitPrice),
        reliabilityScore: Number(option.supplier.reliabilityScore),
        leadTimeDays: Number(option.leadTimeDays),
        moq: option.moq
      }))
    });
    if (!supplierChoice) continue;

    const targetDays = reorderTrigger + 14;
    const reorderQty = Math.max(supplierChoice.moq, Math.ceil(targetDays * dailyDemand - quantityOnHand));
    bySupplier.set(supplierChoice.supplierId, [
      ...(bySupplier.get(supplierChoice.supplierId) ?? []),
      {
        productId: product.id,
        sku: product.sku,
        category: product.category ?? "Uncategorized",
        orderedQuantity: reorderQty,
        unitPrice: supplierChoice.unitPrice
      }
    ]);
  }

  const drafts = [];
  for (const [supplierId, lines] of bySupplier.entries()) {
    drafts.push(
      await createPurchaseOrderDraft(
        {
          shopId,
          supplierId,
          poNumber: `AUTO-${new Date().toISOString().slice(0, 10)}-${supplierId.slice(-5)}`,
          lines,
          notes: "Nightly auto-draft generated from days-of-stock reorder triggers."
        },
        db
      )
    );
  }

  return drafts;
}

export async function enqueueNightlyPurchaseOrderDrafts(shopId: string) {
  await purchaseOrderQueue?.add("nightly-auto-draft-pos", { shopId });
  return { queued: Boolean(purchaseOrderQueue), job: "nightly-auto-draft-pos" };
}

export async function routePurchaseOrderApproval(shopId: string, purchaseOrderId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.purchaseOrders, db);

  const po = await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId, shopId }, include: { lines: true } });
  const total = poTotal(po);
  const policy = approvalPolicyForAmount(total);

  if (policy.autoApprove) {
    await db.purchaseOrderApproval.create({
      data: {
        shopId,
        purchaseOrderId,
        requiredRole: null,
        status: "AUTO_APPROVED",
        token: randomUUID(),
        decidedAt: new Date(),
        note: "Auto-approved under approval threshold."
      }
    });
    return db.purchaseOrder.update({
      where: { id: purchaseOrderId, shopId },
      data: { status: "APPROVED", approvalTier: policy.tier, approvedAt: new Date() },
      include: { lines: true, supplier: true, approvals: true }
    });
  }

  await db.purchaseOrderApproval.create({
    data: {
      shopId,
      purchaseOrderId,
      requiredRole: policy.role,
      token: randomUUID()
    }
  });
  return db.purchaseOrder.update({
    where: { id: purchaseOrderId, shopId },
    data: { status: "PENDING_APPROVAL", approvalTier: policy.tier },
    include: { lines: true, supplier: true, approvals: true }
  });
}

export async function approvePurchaseOrder(
  input: { shopId: string; purchaseOrderId: string; token?: string; approverUserId?: string; note?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const approval = await db.purchaseOrderApproval.findFirst({
    where: {
      shopId: input.shopId,
      purchaseOrderId: input.purchaseOrderId,
      status: "PENDING",
      token: input.token
    }
  });
  if (!approval && input.token) {
    throw new Error("Approval token is invalid or already used");
  }

  if (approval) {
    await db.purchaseOrderApproval.update({
      where: { id: approval.id },
      data: { status: "APPROVED", approverUserId: input.approverUserId, decidedAt: new Date(), note: input.note }
    });
  }

  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: { status: "APPROVED", approvedAt: new Date() },
    include: { lines: true, supplier: true, approvals: true }
  });
}

export async function transitionPurchaseOrderStatus(
  input: { shopId: string; purchaseOrderId: string; status: PurchaseOrderStatus },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);
  const current = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    select: { status: true }
  });
  assertPurchaseOrderTransition(current.status, input.status);

  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: {
      status: input.status,
      sentAt: input.status === "SENT_TO_SUPPLIER" || input.status === "SENT" ? new Date() : undefined,
      closedAt: input.status === "CLOSED" ? new Date() : undefined,
      cancelledAt: input.status === "CANCELLED" ? new Date() : undefined
    },
    include: { lines: true, supplier: true }
  });
}

export async function receivePurchaseOrderLine(
  input: { shopId: string; purchaseOrderId: string; lineId: string; receivedQuantity: number; damagedQuantity?: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const line = await db.purchaseOrderLine.findUniqueOrThrow({
    where: { id: input.lineId },
    include: { purchaseOrder: true }
  });
  const receivedQuantity = line.receivedQuantity + Math.max(0, input.receivedQuantity - (input.damagedQuantity ?? 0));
  const backorderedQuantity = Math.max(0, line.orderedQuantity - receivedQuantity);

  await db.purchaseOrderLine.update({
    where: { id: input.lineId },
    data: { receivedQuantity, backorderedQuantity, receivedAt: new Date() }
  });

  if (backorderedQuantity > 0) {
    await db.backorderReminder.create({
      data: {
        shopId: input.shopId,
        purchaseOrderId: input.purchaseOrderId,
        purchaseOrderLineId: input.lineId,
        supplierId: line.purchaseOrder.supplierId,
        sku: line.sku,
        quantity: backorderedQuantity,
        dueAt: daysFromNow(7),
        recommendation: recommendBackorderAction({
          backorderedQuantity,
          orderedQuantity: line.orderedQuantity,
          supplierReliabilityScore: 70,
          alternateSupplierAvailable: false
        }).recommendation
      }
    });
  }

  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    include: { lines: true, supplier: true }
  });
  const fullyReceived = po.lines.every((poLine) => poLine.id === input.lineId ? receivedQuantity >= poLine.orderedQuantity : poLine.receivedQuantity >= poLine.orderedQuantity);

  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: { status: fullyReceived ? "FULLY_RECEIVED" : "PARTIALLY_RECEIVED", actualDeliveryDate: new Date() },
    include: { lines: true, supplier: true, backorderReminders: true }
  });
}

export async function applyLandedCosts(
  input: { shopId: string; purchaseOrderId: string; freightCost?: number; customsCost?: number; handlingCost?: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    include: { lines: { include: { product: true } } }
  });
  const freightCost = input.freightCost ?? 0;
  const customsCost = input.customsCost ?? 0;
  const handlingCost = input.handlingCost ?? 0;
  const subtotal = po.lines.reduce((sum, line) => sum + line.orderedQuantity * Number(line.unitPrice), 0);
  const landedTotal = subtotal + freightCost + customsCost + handlingCost;
  const totalUnits = po.lines.reduce((sum, line) => sum + line.orderedQuantity, 0);
  const landedCostPerUnit = totalUnits === 0 ? 0 : (freightCost + customsCost + handlingCost) / totalUnits;

  for (const line of po.lines) {
    const landedUnitCost = Number(line.unitPrice) + landedCostPerUnit;
    await db.purchaseOrderLine.update({
      where: { id: line.id },
      data: {
        landedUnitCost,
        marginAfterLandedCost: line.product ? Number(line.product.price) - landedUnitCost : undefined
      }
    });
  }

  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: { subtotal, freightCost, customsCost, handlingCost, landedTotal },
    include: { lines: true, supplier: true }
  });
}

export async function threeWayMatchPurchaseOrder(shopId: string, purchaseOrderId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.purchaseOrders, db);

  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: purchaseOrderId, shopId },
    include: { lines: true, parsedInvoices: { include: { lines: true } } }
  });
  const invoiceLines = po.parsedInvoices.flatMap((invoice) => invoice.lines);
  const mismatches = po.lines.flatMap((line) => {
    const invoiceLine = invoiceLines.find((candidate) => candidate.sku === line.sku);
    const flags = [];
    if (line.orderedQuantity !== line.receivedQuantity) flags.push("PO_QTY_RECEIVED_QTY_MISMATCH");
    if (invoiceLine && line.orderedQuantity !== invoiceLine.quantity) flags.push("PO_QTY_INVOICE_QTY_MISMATCH");
    if (invoiceLine && Math.abs(Number(line.unitPrice) - Number(invoiceLine.unitPrice)) > 0.01) flags.push("PO_PRICE_INVOICE_PRICE_MISMATCH");
    return flags.map((flag) => ({ sku: line.sku, flag }));
  });
  const status: PurchaseOrderStatus = mismatches.length ? "DISPUTED" : "CLOSED";

  return db.purchaseOrder.update({
    where: { id: purchaseOrderId, shopId },
    data: { status, threeWayMatchJson: { mismatches } as Prisma.InputJsonValue, closedAt: mismatches.length ? undefined : new Date() },
    include: { lines: true, supplier: true, parsedInvoices: true }
  });
}

export async function sendPurchaseOrderToSupplier(
  input: { shopId: string; purchaseOrderId: string; to?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const po = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    include: { supplier: true, lines: true }
  });
  const body = formatPurchaseOrderEmail(po);
  const log = await logSupplierCommunication(
    {
      shopId: input.shopId,
      supplierId: po.supplierId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      intent: "PO_FOLLOW_UP",
      subject: `Purchase Order ${po.poNumber}`,
      body,
      status: "ready_to_send",
      externalId: `po-${po.id}`
    },
    db
  );

  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: { status: "SENT_TO_SUPPLIER", sentAt: new Date(), supplierEmailMessageId: log.externalId ?? log.id },
    include: { lines: true, supplier: true }
  });
}

export async function parseSupplierTrackingReply(
  input: { shopId: string; purchaseOrderId: string; emailBody: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.purchaseOrders, db);

  const trackingNumber = extractTrackingNumber(input.emailBody);
  return db.purchaseOrder.update({
    where: { id: input.purchaseOrderId, shopId: input.shopId },
    data: { trackingNumber, notes: input.emailBody },
    include: { lines: true, supplier: true }
  });
}

export async function getPurchaseOrderDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.purchaseOrders, db);

  const purchaseOrders = await db.purchaseOrder.findMany({
    where: { shopId },
    include: { supplier: true, lines: true, approvals: true, backorderReminders: true },
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  return {
    purchaseOrders,
    totals: {
      drafts: purchaseOrders.filter((po) => po.status === "DRAFT").length,
      pendingApproval: purchaseOrders.filter((po) => po.status === "PENDING_APPROVAL").length,
      partial: purchaseOrders.filter((po) => po.status === "PARTIALLY_RECEIVED").length,
      disputed: purchaseOrders.filter((po) => po.status === "DISPUTED").length
    }
  };
}

export function chooseSupplierForProduct(input: {
  defaultSupplierId?: string | null;
  options: Array<{ supplierId: string; unitPrice: number; reliabilityScore: number; leadTimeDays: number; moq: number }>;
}) {
  if (input.options.length === 0) return input.defaultSupplierId ? { supplierId: input.defaultSupplierId, unitPrice: 0, moq: 1, score: 0 } : null;
  return [...input.options]
    .map((option) => ({
      ...option,
      score: option.reliabilityScore * 0.45 + (100 / Math.max(option.unitPrice, 1)) * 0.35 + (100 / Math.max(option.leadTimeDays, 1)) * 0.2
    }))
    .sort((a, b) => b.score - a.score)[0];
}

export function approvalPolicyForAmount(amount: number) {
  if (amount < 500) return { tier: "under_500", autoApprove: true, role: null };
  if (amount < 5000) return { tier: "manager_approval", autoApprove: false, role: "MANAGER" as const };
  return { tier: "owner_approval", autoApprove: false, role: "OWNER" as const };
}

export function calculateReorderPoint(input: {
  dailyDemand: number;
  leadTimeDays: number;
  safetyStockDays: number;
  seasonalBufferDays?: number;
  minimumOrderPoint?: number;
}) {
  const coverageDays = Math.max(0, input.leadTimeDays) + Math.max(0, input.safetyStockDays) + Math.max(0, input.seasonalBufferDays ?? 0);
  return Math.max(input.minimumOrderPoint ?? 0, Math.ceil(Math.max(0, input.dailyDemand) * coverageDays));
}

export const PURCHASE_ORDER_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "APPROVED", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "CANCELLED", "DISPUTED"],
  APPROVED: ["SENT_TO_SUPPLIER", "SENT", "CANCELLED", "DISPUTED"],
  SENT: ["PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "DISPUTED", "CANCELLED"],
  SENT_TO_SUPPLIER: ["PARTIALLY_RECEIVED", "FULLY_RECEIVED", "RECEIVED", "DISPUTED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["FULLY_RECEIVED", "INVOICED", "DISPUTED"],
  FULLY_RECEIVED: ["INVOICED", "CLOSED", "DISPUTED"],
  RECEIVED: ["INVOICED", "CLOSED", "DISPUTED"],
  INVOICED: ["CLOSED", "DISPUTED"],
  CLOSED: [],
  CANCELLED: [],
  DISPUTED: ["PENDING_APPROVAL", "APPROVED", "CANCELLED", "CLOSED"]
};

export function canTransitionPurchaseOrderStatus(from: PurchaseOrderStatus, to: PurchaseOrderStatus) {
  return from === to || PURCHASE_ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function assertPurchaseOrderTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus) {
  if (!canTransitionPurchaseOrderStatus(from, to)) {
    throw new Error(`Invalid purchase order transition ${from} -> ${to}`);
  }
}

export function recommendBackorderAction(input: {
  backorderedQuantity: number;
  orderedQuantity: number;
  supplierReliabilityScore: number;
  alternateSupplierAvailable: boolean;
}) {
  const ratio = input.backorderedQuantity / Math.max(input.orderedQuantity, 1);
  if (input.alternateSupplierAvailable && (ratio > 0.25 || input.supplierReliabilityScore < 65)) {
    return { recommendation: "SOURCE_ALTERNATE" as const, reason: "Backorder is material and an alternate supplier is available." };
  }
  if (ratio > 0.4) {
    return { recommendation: "ADJUST_SHOPIFY_AVAILABILITY" as const, reason: "Backorder is large enough to risk customer-facing availability." };
  }
  return { recommendation: "WAIT_FOR_BACKORDER" as const, reason: "Backorder is small enough to wait for supplier follow-up." };
}

function sumLines(lines: PurchaseOrderLineInput[]) {
  return lines.reduce((sum, line) => sum + line.orderedQuantity * line.unitPrice, 0);
}

function poTotal(po: { lines: Array<{ orderedQuantity: number; unitPrice: unknown }>; freightCost?: unknown; customsCost?: unknown; handlingCost?: unknown }) {
  return po.lines.reduce((sum, line) => sum + line.orderedQuantity * Number(line.unitPrice), 0) + Number(po.freightCost ?? 0) + Number(po.customsCost ?? 0) + Number(po.handlingCost ?? 0);
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function formatPurchaseOrderEmail(po: { poNumber: string; supplier: { name: string }; lines: Array<{ sku: string; orderedQuantity: number; unitPrice: unknown }> }) {
  const lines = po.lines.map((line) => `${line.sku}: ${line.orderedQuantity} units @ $${Number(line.unitPrice).toFixed(2)}`).join("\n");
  return `Hello ${po.supplier.name},\n\nPlease confirm purchase order ${po.poNumber}:\n\n${lines}\n\nReply with tracking number when available.`;
}

function extractTrackingNumber(body: string) {
  return body.match(/\b(1Z[0-9A-Z]{8,}|[A-Z]{2}\d{9}[A-Z]{2}|TRK[-\s]?[A-Z0-9-]{6,})\b/i)?.[0] ?? null;
}
