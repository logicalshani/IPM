import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  applyLandedCosts,
  approvePurchaseOrder,
  parseSupplierTrackingReply,
  receivePurchaseOrderLine,
  sendPurchaseOrderToSupplier,
  threeWayMatchPurchaseOrder,
  transitionPurchaseOrderStatus
} from "@/services/purchaseOrder.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    shopId: z.string(),
    token: z.string().optional(),
    approverUserId: z.string().optional(),
    note: z.string().optional()
  }),
  z.object({
    action: z.literal("transition"),
    shopId: z.string(),
    status: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "INVOICED", "RECEIVED", "CLOSED", "CANCELLED", "DISPUTED"])
  }),
  z.object({
    action: z.literal("receive_line"),
    shopId: z.string(),
    lineId: z.string(),
    receivedQuantity: z.number().int().positive(),
    damagedQuantity: z.number().int().nonnegative().optional()
  }),
  z.object({
    action: z.literal("landed_cost"),
    shopId: z.string(),
    freightCost: z.number().nonnegative().optional(),
    customsCost: z.number().nonnegative().optional(),
    handlingCost: z.number().nonnegative().optional()
  }),
  z.object({ action: z.literal("three_way_match"), shopId: z.string() }),
  z.object({ action: z.literal("send_to_supplier"), shopId: z.string(), to: z.string().email().optional() }),
  z.object({ action: z.literal("parse_tracking_reply"), shopId: z.string(), emailBody: z.string() })
]);

export async function POST(request: Request, { params }: { params: { purchaseOrderId: string } }) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "approve") {
      const { action: _action, ...input } = body;
      return ok(await approvePurchaseOrder({ ...input, purchaseOrderId: params.purchaseOrderId }));
    }
    if (body.action === "transition") {
      return ok(await transitionPurchaseOrderStatus({ shopId: body.shopId, purchaseOrderId: params.purchaseOrderId, status: body.status }));
    }
    if (body.action === "receive_line") {
      const { action: _action, ...input } = body;
      return ok(await receivePurchaseOrderLine({ ...input, purchaseOrderId: params.purchaseOrderId }));
    }
    if (body.action === "landed_cost") {
      const { action: _action, ...input } = body;
      return ok(await applyLandedCosts({ ...input, purchaseOrderId: params.purchaseOrderId }));
    }
    if (body.action === "three_way_match") {
      return ok(await threeWayMatchPurchaseOrder(body.shopId, params.purchaseOrderId));
    }
    if (body.action === "send_to_supplier") {
      return ok(await sendPurchaseOrderToSupplier({ shopId: body.shopId, purchaseOrderId: params.purchaseOrderId, to: body.to }));
    }
    return ok(await parseSupplierTrackingReply({ shopId: body.shopId, purchaseOrderId: params.purchaseOrderId, emailBody: body.emailBody }));
  } catch (error) {
    return apiError(error);
  }
}
