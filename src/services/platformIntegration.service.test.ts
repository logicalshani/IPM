import { describe, expect, it, vi } from "vitest";
import {
  SHOPIFY_WEBHOOK_REGISTRATIONS,
  SHOPIFY_WEBHOOK_TOPICS,
  buildShopifyInstallUrl,
  buildCsvJournalEntry,
  completeShopifyOAuthInstall,
  createPublicApiKey,
  handleChatCommand,
  handleShopifyWebhook,
  getShopifyInstallStatus,
  normalizeShopifyDomain,
  postRealtimeStockAlert,
  rateLimitForPlan,
  registerShopifyWebhookSubscriptions,
  signShopifyWebhookPayload,
  verifyShopifyOAuthHmac,
  verifyShopifyWebhookSignature
} from "./platformIntegration.service";
import { createHmac } from "node:crypto";

describe("platformIntegration.service", () => {
  it("normalizes Shopify domains and builds OAuth install URLs", () => {
    process.env.SHOPIFY_API_KEY = "client_id_test";

    const url = new URL(buildShopifyInstallUrl({ shop: "https://Core-Store.myshopify.com/admin", state: "state_1", appUrl: "https://imp.test" }));

    expect(normalizeShopifyDomain("Core-Store.myshopify.com")).toBe("core-store.myshopify.com");
    expect(url.origin).toBe("https://core-store.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client_id_test");
    expect(url.searchParams.get("redirect_uri")).toBe("https://imp.test/api/auth/shopify/callback");
    expect(url.searchParams.get("scope")).toContain("read_inventory");
    expect(() => normalizeShopifyDomain("example.com")).toThrow("valid Shopify shop domain");
  });

  it("verifies Shopify OAuth callback HMACs", () => {
    const secret = "oauth_secret";
    const params = new URLSearchParams({
      shop: "core-store.myshopify.com",
      code: "code_123",
      state: "state_1",
      timestamp: "1710000000"
    });
    const message = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));

    expect(verifyShopifyOAuthHmac(params, secret)).toBe(true);
    params.set("code", "tampered");
    expect(verifyShopifyOAuthHmac(params, secret)).toBe(false);
  });

  it("completes Shopify OAuth install through service-layer writes", async () => {
    process.env.SHOPIFY_API_KEY = "client_id_test";
    process.env.SHOPIFY_API_SECRET = "oauth_secret";
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = "token_secret";

    const params = new URLSearchParams({
      shop: "core-store.myshopify.com",
      code: "code_123",
      state: "state_1",
      timestamp: "1710000000"
    });
    const message = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    params.set("hmac", createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(message).digest("hex"));

    const db = {
      shop: {
        upsert: vi.fn().mockResolvedValue({ id: "shop_1", shopifyDomain: "core-store.myshopify.com", billingPlan: "starter" })
      },
      feature: {
        upsert: vi.fn().mockResolvedValue({ id: "feature_1", status: "ENABLED" }),
        findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" })
      },
      integrationConnection: {
        upsert: vi.fn().mockResolvedValue({ id: "conn_1", status: "CONNECTED" })
      },
      syncLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ access_token: "shpat_test_token", scope: "read_products,write_products" })
    }) as any;

    await expect(completeShopifyOAuthInstall({ params, expectedState: "state_1", appUrl: "https://imp.test" }, db, fetcher)).resolves.toMatchObject({
      shop: { id: "shop_1" },
      connection: { status: "CONNECTED" }
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://core-store.myshopify.com/admin/oauth/access_token",
      expect.objectContaining({ method: "POST" })
    );
    expect(db.integrationConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          provider: "SHOPIFY",
          status: "CONNECTED",
          externalAccountId: "core-store.myshopify.com",
          config: expect.objectContaining({ encryptedAccessToken: expect.stringMatching(/^v1:/) })
        })
      })
    );
    expect(db.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endpoint: "/admin/oauth/access_token", status: "SUCCESS" }) })
    );
  });

  it("declares the complete Shopify webhook topic coverage", () => {
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("products/create");
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("refunds/create");
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("orders/refunded");
    expect(SHOPIFY_WEBHOOK_TOPICS).toContain("app/uninstalled");
  });

  it("checks Shopify install status from the persisted connection", async () => {
    const db = {
      shop: {
        findUnique: vi.fn().mockResolvedValue({
          id: "shop_1",
          shopifyDomain: "core-store.myshopify.com",
          integrationConnections: [{ id: "conn_1", provider: "SHOPIFY", status: "CONNECTED" }]
        })
      }
    } as any;

    await expect(getShopifyInstallStatus({ shop: "core-store.myshopify.com" }, db)).resolves.toMatchObject({
      installed: true,
      connection: { id: "conn_1" }
    });
    expect(db.shop.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopifyDomain: "core-store.myshopify.com" },
        include: expect.objectContaining({
          integrationConnections: expect.objectContaining({ where: { provider: "SHOPIFY", status: "CONNECTED" } })
        })
      })
    );
  });

  it("registers Shopify webhooks through Admin GraphQL and logs each subscription", async () => {
    process.env.SHOPIFY_ADMIN_API_VERSION = "2026-04";
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      syncLog: { create: vi.fn().mockResolvedValue({ id: "log_1" }) }
    } as any;
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: {
          webhookSubscriptionCreate: {
            webhookSubscription: { id: "gid://shopify/WebhookSubscription/1", topic: "PRODUCTS_CREATE" },
            userErrors: []
          }
        }
      })
    }) as any;

    const results = await registerShopifyWebhookSubscriptions(
      { shopId: "shop_1", shop: "core-store.myshopify.com", accessToken: "shpat_test", appUrl: "https://imp.test" },
      db,
      fetcher
    );

    expect(results).toHaveLength(SHOPIFY_WEBHOOK_REGISTRATIONS.length);
    expect(fetcher).toHaveBeenCalledWith(
      "https://core-store.myshopify.com/admin/api/2026-04/graphql.json",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Shopify-Access-Token": "shpat_test" })
      })
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body).variables).toMatchObject({
      topic: "PRODUCTS_CREATE",
      webhookSubscription: { callbackUrl: "https://imp.test/api/platform/shopify/webhooks/products/create", format: "JSON" }
    });
    expect(db.syncLog.create).toHaveBeenCalledTimes(SHOPIFY_WEBHOOK_REGISTRATIONS.length);
    expect(db.syncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endpoint: "/admin/api/2026-04/graphql.json#webhookSubscriptionCreate", status: "SUCCESS" }) })
    );
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
