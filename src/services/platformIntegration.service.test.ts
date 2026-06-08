import { describe, expect, it, vi } from "vitest";
import {
  SHOPIFY_WEBHOOK_TOPICS,
  buildCsvJournalEntry,
  createPublicApiKey,
  handleChatCommand,
  handleShopifyWebhook,
  postRealtimeStockAlert,
  rateLimitForPlan,
  signShopifyWebhookPayload,
  verifyShopifyWebhookSignature
} from "./platformIntegration.service";

describe("platformIntegration.service", () => {
  it("declares the complete Shopify webhook topic coverage", () => {
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("products/create");
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("orders/refunded");
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("app/uninstalled");
  });

  it("stores Shopify webhook events and logs the sync call", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      shopifyWebhookEvent: { create: vi.fn().mockResolvedValue({ id: "event_1" }) },
      syncLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;

    await handleShopifyWebhook({ shopId: "shop_1", topic: "products/update", payload: { id: 123 } }, db);

    expect(db.shopifyWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ topic: "products/update", status: "PROCESSED" }) })
    );
    expect(db.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: "SHOPIFY", direction: "INBOUND" }) })
    );
  });

  it("verifies Shopify webhook signatures with HMAC SHA-256", () => {
    const payload = JSON.stringify({ id: 123, title: "Core Tee" });
    const signature = signShopifyWebhookPayload(payload, "shpss_test_secret");

    expect(verifyShopifyWebhookSignature(payload, signature, "shpss_test_secret")).toBe(true);
    expect(verifyShopifyWebhookSignature(payload, signature, "wrong_secret")).toBe(false);
    expect(verifyShopifyWebhookSignature(payload, null, "shpss_test_secret")).toBe(false);
  });

  it("builds generic CSV accounting journal entries", () => {
    const csv = buildCsvJournalEntry([{ account: "Inventory Asset", debit: 120, memo: "Valuation snapshot" }]);
    expect(csv).toContain("Date,Account,Debit,Credit,Memo");
    expect(csv).toContain("Inventory Asset");
  });

  it("parses Slack and Teams reorder commands", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod_1",
          sku: "SKU-1234",
          category: "Accessories",
          supplierId: "sup_1",
          cost: 8,
          inventory: [{ quantity: 2 }],
          demandProfile: { baselineDailyDemand: 1.2 },
          supplierRecord: { id: "sup_1" }
        })
      },
      purchaseOrder: {
        create: vi.fn().mockResolvedValue({ id: "po_1", poNumber: "CHAT-1", lines: [] })
      },
      syncLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;

    await expect(handleChatCommand({ shopId: "shop_1", provider: "SLACK", command: "/imp reorder SKU-1234" }, db)).resolves.toMatchObject({
      handled: true,
      sku: "SKU-1234",
      created: true,
      purchaseOrderId: "po_1"
    });
    expect(db.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT", supplierId: "sup_1" }) })
    );
  });

  it("posts real-time low-stock alerts through chat logs", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      syncLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;

    await expect(postRealtimeStockAlert({ shopId: "shop_1", provider: "SLACK", sku: "SKU-1234", quantity: 0 }, db)).resolves.toMatchObject({
      delivered: true
    });
    expect(db.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endpoint: "chat.postMessage", direction: "OUTBOUND" }) })
    );
  });

  it("creates API keys with hashed storage and exposes plan rate limits", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      publicApiKey: { create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "key_1", ...data })) }
    } as any;

    const key = await createPublicApiKey({ shopId: "shop_1", name: "Pro key", plan: "pro" }, db);
    expect(key.rawKey).toMatch(/^imp_/);
    expect(key.keyHash).not.toBe(key.rawKey);
    expect(rateLimitForPlan("growth")).toBe(100);
    expect(rateLimitForPlan("pro")).toBe(1000);
    expect(rateLimitForPlan("enterprise")).toBe(Infinity);
  });
});
