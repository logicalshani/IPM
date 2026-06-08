import { z } from "zod";
import { apiError, ok } from "@/lib/api";
import {
  createWhatsAppSupplierMessage,
  logSupplierCommunication,
  sendSupplierEmail
} from "@/services/supplierCommunication.service";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("log"),
    shopId: z.string(),
    supplierId: z.string(),
    channel: z.enum(["EMAIL", "WHATSAPP", "PHONE", "NOTE"]),
    direction: z.enum(["OUTBOUND", "INBOUND"]),
    intent: z.enum(["PO_FOLLOW_UP", "DELAY_INQUIRY", "PRICE_NEGOTIATION", "INVOICE_DISPUTE", "RETURN_REQUEST"]).optional(),
    subject: z.string().optional(),
    body: z.string(),
    status: z.string().optional()
  }),
  z.object({
    action: z.literal("send_email"),
    shopId: z.string(),
    supplierId: z.string(),
    to: z.string().email(),
    subject: z.string(),
    body: z.string(),
    provider: z.enum(["resend", "sendgrid"]).optional()
  }),
  z.object({
    action: z.literal("whatsapp_payload"),
    shopId: z.string(),
    supplierId: z.string(),
    to: z.string(),
    body: z.string(),
    templateName: z.string().optional()
  })
]);

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    if (body.action === "send_email") {
      return ok(await sendSupplierEmail(body), { status: 201 });
    }
    if (body.action === "whatsapp_payload") {
      return ok(await createWhatsAppSupplierMessage(body), { status: 201 });
    }
    const { action: _action, ...input } = body;
    return ok(await logSupplierCommunication(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
