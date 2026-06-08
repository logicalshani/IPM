import type { PrismaClient, SupplierEmailIntent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function logSupplierCommunication(
  input: {
    shopId: string;
    supplierId: string;
    channel: "EMAIL" | "WHATSAPP" | "PHONE" | "NOTE";
    direction: "OUTBOUND" | "INBOUND";
    intent?: SupplierEmailIntent;
    subject?: string;
    body: string;
    externalId?: string;
    status?: string;
    sentAt?: Date;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierCommunications, db);

  return db.supplierCommunication.create({
    data: {
      ...input,
      status: input.status ?? "logged"
    }
  });
}

export async function sendSupplierEmail(
  input: {
    shopId: string;
    supplierId: string;
    to: string;
    subject: string;
    body: string;
    provider?: "resend" | "sendgrid";
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierCommunications, db);

  const provider = input.provider ?? (process.env.RESEND_API_KEY ? "resend" : "sendgrid");
  const result = await sendViaProvider(provider, input.to, input.subject, input.body);

  return logSupplierCommunication(
    {
      shopId: input.shopId,
      supplierId: input.supplierId,
      channel: "EMAIL",
      direction: "OUTBOUND",
      subject: input.subject,
      body: input.body,
      externalId: result.externalId,
      status: result.status,
      sentAt: new Date()
    },
    db
  );
}

export async function createWhatsAppSupplierMessage(
  input: {
    shopId: string;
    supplierId: string;
    to: string;
    body: string;
    templateName?: string;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.supplierCommunications, db);

  const payload = {
    messaging_product: "whatsapp",
    to: input.to,
    type: input.templateName ? "template" : "text",
    template: input.templateName ? { name: input.templateName, language: { code: "en_US" } } : undefined,
    text: input.templateName ? undefined : { body: input.body }
  };

  const log = await logSupplierCommunication(
    {
      shopId: input.shopId,
      supplierId: input.supplierId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      body: input.body,
      status: "ready_to_send"
    },
    db
  );

  return { payload, log };
}

export async function getSupplierThread(shopId: string, supplierId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.supplierCommunications, db);

  return db.supplierCommunication.findMany({
    where: { shopId, supplierId },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

async function sendViaProvider(provider: "resend" | "sendgrid", to: string, subject: string, body: string) {
  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY) {
      return { status: "draft_no_resend_key", externalId: undefined };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.SUPPLIER_EMAIL_FROM ?? "Inventory Manager Pro <suppliers@example.com>",
        to,
        subject,
        text: body
      })
    });
    const payload = await response.json().catch(() => ({}));
    return { status: response.ok ? "sent" : "send_failed", externalId: payload.id as string | undefined };
  }

  if (!process.env.SENDGRID_API_KEY) {
    return { status: "draft_no_sendgrid_key", externalId: undefined };
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.SUPPLIER_EMAIL_FROM ?? "suppliers@example.com" },
      subject,
      content: [{ type: "text/plain", value: body }]
    })
  });

  return { status: response.ok ? "sent" : "send_failed", externalId: response.headers.get("x-message-id") ?? undefined };
}
