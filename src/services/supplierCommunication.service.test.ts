import { describe, expect, it, vi } from "vitest";
import {
  createWhatsAppSupplierMessage,
  logSupplierCommunication,
  sendSupplierEmail
} from "./supplierCommunication.service";

function enabledDb() {
  return {
    feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
    supplierCommunication: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "comm_1", ...data }))
    }
  } as any;
}

describe("supplierCommunication.service", () => {
  it("logs manual supplier communications", async () => {
    const db = enabledDb();
    await logSupplierCommunication(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        channel: "NOTE",
        direction: "INBOUND",
        body: "Supplier confirmed delay."
      },
      db
    );

    expect(db.supplierCommunication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "logged" }) })
    );
  });

  it("keeps email as draft when provider keys are absent", async () => {
    const db = enabledDb();
    const result = await sendSupplierEmail(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        to: "supplier@example.com",
        subject: "PO follow-up",
        body: "Can you confirm the delivery date?",
        provider: "resend"
      },
      db
    );

    expect(result.status).toBe("draft_no_resend_key");
  });

  it("builds WhatsApp Business API placeholder payloads", async () => {
    const result = await createWhatsAppSupplierMessage(
      {
        shopId: "shop_1",
        supplierId: "supplier_1",
        to: "+15555555555",
        body: "Please confirm PO-1001."
      },
      enabledDb()
    );

    expect(result.payload).toMatchObject({ messaging_product: "whatsapp", type: "text" });
  });
});
