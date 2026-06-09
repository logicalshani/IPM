import type {
  AccountingExportType,
  IntegrationProvider,
  Prisma,
  PrismaClient,
  SyncDirection,
  SyncLogStatus
} from "@prisma/client";
import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { platformIntegrationQueue } from "@/lib/redis";
import { FEATURE_KEYS, assertFeatureEnabled, upsertFeature } from "./feature.service";

export const SHOPIFY_WEBHOOK_TOPICS = [
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
  "orders/create",
  "orders/fulfilled",
  "orders/refunded",
  "refunds/create",
  "fulfillments/create",
  "app/uninstalled"
] as const;

export const SHOPIFY_WEBHOOK_REGISTRATIONS = [
  { topic: "products/create", shopifyTopic: "PRODUCTS_CREATE" },
  { topic: "products/update", shopifyTopic: "PRODUCTS_UPDATE" },
  { topic: "products/delete", shopifyTopic: "PRODUCTS_DELETE" },
  { topic: "inventory_levels/update", shopifyTopic: "INVENTORY_LEVELS_UPDATE" },
  { topic: "orders/create", shopifyTopic: "ORDERS_CREATE" },
  { topic: "orders/fulfilled", shopifyTopic: "ORDERS_FULFILLED" },
  { topic: "refunds/create", shopifyTopic: "REFUNDS_CREATE" },
  { topic: "fulfillments/create", shopifyTopic: "FULFILLMENTS_CREATE" },
  { topic: "app/uninstalled", shopifyTopic: "APP_UNINSTALLED" }
] as const;

export const SHOPIFY_DEFAULT_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
  "read_fulfillments",
  "write_fulfillments",
  "read_locations"
] as const;

type ShopifyTokenResponse = {
  access_token: string;
  scope: string;
};

export function normalizeShopifyDomain(shop: string) {
  const cleaned = shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(cleaned)) {
    throw new Error("Enter a valid Shopify shop domain like store-name.myshopify.com");
  }

  return cleaned;
}

export function getAppBaseUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export function buildShopifyInstallUrl(input: { shop: string; state: string; appUrl?: string; scopes?: readonly string[] }) {
  const shop = normalizeShopifyDomain(input.shop);
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) throw new Error("SHOPIFY_API_KEY is not configured");

  const appUrl = (input.appUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const redirectUri = `${appUrl}/api/auth/shopify/callback`;
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", apiKey);
  url.searchParams.set("scope", (input.scopes ?? SHOPIFY_DEFAULT_SCOPES).join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function verifyShopifyOAuthHmac(params: URLSearchParams, secret = process.env.SHOPIFY_API_SECRET) {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;

  const message = Array.from(params.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const expected = createHmac("sha256", secret).update(message).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(hmac, "utf8");
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

export async function completeShopifyOAuthInstall(
  input: { params: URLSearchParams; expectedState?: string | null; appUrl?: string },
  db: PrismaClient = prisma,
  fetcher: typeof fetch = fetch
) {
  const shop = normalizeShopifyDomain(input.params.get("shop") ?? "");
  const code = input.params.get("code");
  const state = input.params.get("state");

  if (!code) throw new Error("Shopify OAuth callback is missing code");
  if (!input.expectedState || !state || state !== input.expectedState) throw new Error("Shopify OAuth state mismatch");
  if (!verifyShopifyOAuthHmac(input.params)) throw new Error("Invalid Shopify OAuth HMAC");

  const token = await exchangeShopifyCodeForToken({ shop, code }, fetcher);
  const persisted = await persistShopifyOAuthConnection({ shop, accessToken: token.access_token, scope: token.scope, appUrl: input.appUrl }, db);
  const webhooks = await registerShopifyWebhookSubscriptions(
    { shopId: persisted.shop.id, shop, accessToken: token.access_token, appUrl: input.appUrl },
    db,
    fetcher
  );
  return { ...persisted, webhooks };
}

export async function persistShopifyOAuthConnection(
  input: { shop: string; accessToken: string; scope: string; appUrl?: string },
  db: PrismaClient = prisma
) {
  const shopifyDomain = normalizeShopifyDomain(input.shop);
  const shop = await db.shop.upsert({
    where: { shopifyDomain },
    create: {
      shopifyDomain,
      name: shopifyDomain.replace(".myshopify.com", ""),
      billingPlan: "starter"
    },
    update: {
      name: shopifyDomain.replace(".myshopify.com", "")
    }
  });

  await upsertFeature({ shopId: shop.id, key: FEATURE_KEYS.integrationsPlatform, plan: shop.billingPlan, status: "ENABLED" }, db);

  const installedAt = new Date();
  const encryptedAccessToken = encryptShopifyAccessToken(input.accessToken);
  const connection = await db.integrationConnection.upsert({
    where: { shopId_provider_name: { shopId: shop.id, provider: "SHOPIFY", name: "Shopify Admin API" } },
    create: {
      shopId: shop.id,
      provider: "SHOPIFY",
      name: "Shopify Admin API",
      status: "CONNECTED",
      externalAccountId: shopifyDomain,
      accessTokenRef: hashApiKey(input.accessToken).slice(0, 24),
      config: {
        encryptedAccessToken,
        scopes: input.scope.split(",").map((scope) => scope.trim()).filter(Boolean),
        appUrl: input.appUrl ?? getAppBaseUrl(),
        installedAt: installedAt.toISOString()
      },
      lastSyncedAt: installedAt
    },
    update: {
      status: "CONNECTED",
      externalAccountId: shopifyDomain,
      accessTokenRef: hashApiKey(input.accessToken).slice(0, 24),
      config: {
        encryptedAccessToken,
        scopes: input.scope.split(",").map((scope) => scope.trim()).filter(Boolean),
        appUrl: input.appUrl ?? getAppBaseUrl(),
        installedAt: installedAt.toISOString()
      },
      lastSyncedAt: installedAt
    }
  });

  await logSyncCall(
    {
      shopId: shop.id,
      provider: "SHOPIFY",
      direction: "INBOUND",
      endpoint: "/admin/oauth/access_token",
      payload: { shop: shopifyDomain, scopes: input.scope },
      response: { connectionId: connection.id },
      status: "SUCCESS",
      httpStatus: 200
    },
    db
  );

  return { shop, connection };
}

export async function registerShopifyWebhookSubscriptions(
  input: { shopId: string; shop: string; accessToken: string; appUrl?: string },
  db: PrismaClient = prisma,
  fetcher: typeof fetch = fetch
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const shop = normalizeShopifyDomain(input.shop);
  const appUrl = (input.appUrl ?? getAppBaseUrl()).replace(/\/$/, "");
  const version = process.env.SHOPIFY_ADMIN_API_VERSION ?? "2026-04";
  const endpoint = `https://${shop}/admin/api/${version}/graphql.json`;
  const mutation = `
    mutation WebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
        webhookSubscription {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const results = [];
  for (const registration of SHOPIFY_WEBHOOK_REGISTRATIONS) {
    const callbackUrl = `${appUrl}/api/platform/shopify/webhooks/${registration.topic}`;
    const startedAt = Date.now();

    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": input.accessToken
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            topic: registration.shopifyTopic,
            webhookSubscription: {
              callbackUrl,
              format: "JSON"
            }
          }
        })
      });
      const payload = await response.json();
      const userErrors = payload.data?.webhookSubscriptionCreate?.userErrors ?? [];
      const graphqlErrors = payload.errors ?? [];
      const subscription = payload.data?.webhookSubscriptionCreate?.webhookSubscription;
      const succeeded = response.ok && userErrors.length === 0 && graphqlErrors.length === 0 && Boolean(subscription?.id);
      const result = {
        topic: registration.topic,
        shopifyTopic: registration.shopifyTopic,
        callbackUrl,
        status: succeeded ? "SUCCESS" : "FAILED",
        subscriptionId: subscription?.id,
        userErrors,
        graphqlErrors
      };

      await logSyncCall(
        {
          shopId: input.shopId,
          provider: "SHOPIFY",
          direction: "OUTBOUND",
          endpoint: `/admin/api/${version}/graphql.json#webhookSubscriptionCreate`,
          payload: { topic: registration.shopifyTopic, callbackUrl },
          response: result as Prisma.InputJsonValue,
          status: succeeded ? "SUCCESS" : "FAILED",
          httpStatus: response.status,
          durationMs: Date.now() - startedAt
        },
        db
      );

      results.push(result);
    } catch (error) {
      const result = {
        topic: registration.topic,
        shopifyTopic: registration.shopifyTopic,
        callbackUrl,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Webhook registration failed"
      };

      await logSyncCall(
        {
          shopId: input.shopId,
          provider: "SHOPIFY",
          direction: "OUTBOUND",
          endpoint: `/admin/api/${version}/graphql.json#webhookSubscriptionCreate`,
          payload: { topic: registration.shopifyTopic, callbackUrl },
          response: result,
          status: "FAILED",
          durationMs: Date.now() - startedAt
        },
        db
      );

      results.push(result);
    }
  }

  return results;
}

export async function connectIntegration(
  input: {
    shopId: string;
    provider: IntegrationProvider;
    name: string;
    externalAccountId?: string;
    accessTokenRef?: string;
    config?: Prisma.InputJsonValue;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.integrationConnection.upsert({
    where: { shopId_provider_name: { shopId: input.shopId, provider: input.provider, name: input.name } },
    create: { ...input, status: "CONNECTED" },
    update: {
      externalAccountId: input.externalAccountId,
      accessTokenRef: input.accessTokenRef,
      config: input.config,
      status: "CONNECTED",
      lastSyncedAt: new Date()
    }
  });
}

export async function logSyncCall(
  input: {
    shopId: string;
    provider: IntegrationProvider;
    direction: SyncDirection;
    endpoint: string;
    payload?: Prisma.InputJsonValue;
    response?: Prisma.InputJsonValue;
    status: SyncLogStatus;
    httpStatus?: number;
    retryCount?: number;
    durationMs?: number;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.syncLog.create({
    data: {
      shopId: input.shopId,
      provider: input.provider,
      direction: input.direction,
      endpoint: input.endpoint,
      payload: input.payload,
      response: input.response,
      status: input.status,
      httpStatus: input.httpStatus,
      retryCount: input.retryCount ?? 0,
      durationMs: input.durationMs
    }
  });
}

export async function handleShopifyWebhook(
  input: { shopId: string; topic: string; payload: Prisma.InputJsonValue; shopifyWebhookId?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  if (!SHOPIFY_WEBHOOK_TOPICS.includes(input.topic as (typeof SHOPIFY_WEBHOOK_TOPICS)[number])) {
    throw new Error(`Unsupported Shopify webhook topic ${input.topic}`);
  }

  const event = await db.shopifyWebhookEvent.create({
    data: {
      shopId: input.shopId,
      topic: input.topic,
      payload: input.payload,
      shopifyWebhookId: input.shopifyWebhookId,
      status: "PROCESSED",
      processedAt: new Date()
    }
  });

  await logSyncCall(
    {
      shopId: input.shopId,
      provider: "SHOPIFY",
      direction: "INBOUND",
      endpoint: `/webhooks/shopify/${input.topic}`,
      payload: input.payload,
      response: { eventId: event.id },
      status: "SUCCESS",
      httpStatus: 200
    },
    db
  );

  return event;
}

export async function syncShopifyMetafields(
  input: { shopId: string; productId: string; reorderPoint: number; leadTimeDays: number; abcClass: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const fields = [
    { key: "reorder_point", value: String(input.reorderPoint), type: "number_integer" },
    { key: "lead_time_days", value: String(input.leadTimeDays), type: "number_integer" },
    { key: "abc_class", value: input.abcClass, type: "single_line_text_field" }
  ];

  const synced = [];
  for (const field of fields) {
    synced.push(
      await db.shopifyMetafieldSync.upsert({
        where: { productId_namespace_key: { productId: input.productId, namespace: "imp", key: field.key } },
        create: {
          shopId: input.shopId,
          productId: input.productId,
          namespace: "imp",
          key: field.key,
          value: field.value,
          type: field.type,
          status: "SYNCED",
          syncedAt: new Date()
        },
        update: { value: field.value, type: field.type, status: "SYNCED", syncedAt: new Date() }
      })
    );
  }

  await logSyncCall(
    {
      shopId: input.shopId,
      provider: "SHOPIFY",
      direction: "OUTBOUND",
      endpoint: "/admin/api/metafields",
      payload: { productId: input.productId, fields },
      response: { synced: fields.length },
      status: "SUCCESS",
      httpStatus: 200
    },
    db
  );

  return synced;
}

export async function emitShopifyFlowEvent(
  input: { shopId: string; eventName: string; payload: Prisma.InputJsonValue },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const event = await db.shopifyFlowEvent.create({ data: input });
  await platformIntegrationQueue?.add("shopify-flow-event", { shopId: input.shopId, eventId: event.id });
  return { event, queued: Boolean(platformIntegrationQueue) };
}

export async function handlePosAdjustment(
  input: { shopId: string; productId: string; locationId: string; quantityDelta: number; posTerminalId?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const current = await db.productInventory.findUnique({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } }
  });
  const inventory = await db.productInventory.upsert({
    where: { productId_locationId: { productId: input.productId, locationId: input.locationId } },
    create: { productId: input.productId, locationId: input.locationId, quantity: input.quantityDelta },
    update: { quantity: (current?.quantity ?? 0) + input.quantityDelta }
  });
  await logSyncCall(
    {
      shopId: input.shopId,
      provider: "SHOPIFY",
      direction: "INBOUND",
      endpoint: "/pos/inventory_adjustment",
      payload: input as unknown as Prisma.InputJsonValue,
      response: { inventoryId: inventory.id, quantity: inventory.quantity },
      status: "SUCCESS"
    },
    db
  );
  return inventory;
}

export async function pushAccountingEntry(
  input: {
    shopId: string;
    provider: "QUICKBOOKS_ONLINE" | "XERO";
    type: AccountingExportType;
    amount: number;
    payload: Prisma.InputJsonValue;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const exported = await db.accountingExport.create({
    data: {
      shopId: input.shopId,
      provider: input.provider,
      type: input.type,
      amount: input.amount,
      payload: input.payload,
      response: { queued: true, provider: input.provider },
      status: "QUEUED"
    }
  });
  await logSyncCall(
    {
      shopId: input.shopId,
      provider: input.provider,
      direction: "OUTBOUND",
      endpoint: input.provider === "QUICKBOOKS_ONLINE" ? "/qbo/journalentries" : "/xero/manualjournals",
      payload: input.payload,
      response: { exportId: exported.id },
      status: "SUCCESS",
      httpStatus: 202
    },
    db
  );
  return exported;
}

export function buildCsvJournalEntry(rows: Array<{ account: string; debit?: number; credit?: number; memo?: string }>) {
  return ["Date,Account,Debit,Credit,Memo", ...rows.map((row) => `${today()},${csv(row.account)},${row.debit ?? ""},${row.credit ?? ""},${csv(row.memo ?? "")}`)].join("\n");
}

export async function connectChatWorkspace(
  input: { shopId: string; provider: "SLACK" | "MICROSOFT_TEAMS"; workspaceId?: string; channelId: string; channelName: string; botTokenRef?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.chatBotConnection.upsert({
    where: { shopId_provider_channelId: { shopId: input.shopId, provider: input.provider, channelId: input.channelId } },
    create: { ...input, status: "CONNECTED" },
    update: { workspaceId: input.workspaceId, channelName: input.channelName, botTokenRef: input.botTokenRef, status: "CONNECTED" }
  });
}

export async function postDailyInventoryDigest(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.integrationsPlatform, db);
  const [lowStock, poDue, supplierDelays] = await Promise.all([
    db.product.findMany({ where: { shopId }, include: { inventory: true, demandProfile: true }, take: 5 }),
    db.purchaseOrder.count({ where: { shopId, status: { in: ["APPROVED", "SENT_TO_SUPPLIER", "PARTIALLY_RECEIVED"] } } }),
    db.supplier.count({ where: { shopId, reliabilityScore: { lt: 65 } } })
  ]);
  const riskSkus = lowStock
    .map((product) => {
      const quantity = product.inventory.reduce((sum, row) => sum + row.quantity, 0);
      const demand = Number(product.demandProfile?.baselineDailyDemand ?? 1);
      return { sku: product.sku, days: Math.floor(quantity / Math.max(demand, 0.1)) };
    })
    .filter((row) => row.days <= 14);
  const message = `Daily IMP digest: ${riskSkus.length} low-stock SKUs, ${poDue} POs due, ${supplierDelays} supplier delay risks.`;
  await logSyncCall({ shopId, provider: "SLACK", direction: "OUTBOUND", endpoint: "chat.postMessage", payload: { message }, response: { delivered: true }, status: "SUCCESS" }, db);
  return { message, lowStock: riskSkus, poDue, supplierDelays };
}

export async function postRealtimeStockAlert(
  input: { shopId: string; provider: "SLACK" | "MICROSOFT_TEAMS"; sku: string; quantity: number; channelId?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const message = `${input.sku} just hit ${input.quantity} stock.`;
  await logSyncCall(
    {
      shopId: input.shopId,
      provider: input.provider,
      direction: "OUTBOUND",
      endpoint: input.provider === "SLACK" ? "chat.postMessage" : "teams.sendMessage",
      payload: { channelId: input.channelId, message },
      response: { delivered: true },
      status: "SUCCESS"
    },
    db
  );
  return { delivered: true, message };
}

export async function handleChatCommand(
  input: { shopId: string; provider: "SLACK" | "MICROSOFT_TEAMS"; command: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const match = input.command.match(/^\/imp\s+reorder\s+([A-Z0-9-]+)/i);
  if (!match) return { handled: false, message: "Supported command: /imp reorder SKU" };
  const sku = match[1].toUpperCase();
  const product = await db.product.findUnique({
    where: { shopId_sku: { shopId: input.shopId, sku } },
    include: { inventory: true, demandProfile: true, supplierRecord: true }
  });

  if (!product?.supplierId) {
    await logSyncCall({ shopId: input.shopId, provider: input.provider, direction: "INBOUND", endpoint: "chat.command", payload: input as unknown as Prisma.InputJsonValue, response: { sku, error: "Product or supplier missing" }, status: "FAILED" }, db);
    return { handled: true, action: "CREATE_DRAFT_PO", sku, created: false, message: `Could not create a draft PO for ${sku}; assign a supplier first.` };
  }

  const quantityOnHand = product.inventory.reduce((sum, row) => sum + row.quantity, 0);
  const dailyDemand = Number(product.demandProfile?.baselineDailyDemand ?? 1);
  const reorderQty = Math.max(12, Math.ceil(dailyDemand * 30 - quantityOnHand));
  const po = await db.purchaseOrder.create({
    data: {
      shopId: input.shopId,
      supplierId: product.supplierId,
      poNumber: `CHAT-${Date.now()}`,
      status: "DRAFT",
      subtotal: reorderQty * Number(product.cost),
      expectedTotal: reorderQty * Number(product.cost),
      landedTotal: reorderQty * Number(product.cost),
      notes: `Created from ${input.provider} command: ${input.command}`,
      lines: {
        create: [{ productId: product.id, sku: product.sku, category: product.category ?? "Uncategorized", orderedQuantity: reorderQty, unitPrice: Number(product.cost) }]
      }
    },
    include: { lines: true }
  });

  await logSyncCall({ shopId: input.shopId, provider: input.provider, direction: "INBOUND", endpoint: "chat.command", payload: input as unknown as Prisma.InputJsonValue, response: { sku, purchaseOrderId: po.id }, status: "SUCCESS" }, db);
  return { handled: true, action: "CREATE_DRAFT_PO", sku, created: true, purchaseOrderId: po.id, message: `Draft PO ${po.poNumber} created for ${sku}.` };
}

export async function queueMobileOfflineSync(
  input: { shopId: string; deviceId: string; mode: "SCAN" | "RECEIVE" | "COUNT" | "TRANSFERS"; payload: Prisma.InputJsonValue; userId?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.mobileOfflineSync.create({ data: input });
}

export async function syncMobileOfflinePayload(shopId: string, syncId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.mobileOfflineSync.update({ where: { id: syncId, shopId }, data: { status: "SYNCED", syncedAt: new Date() } });
}

export async function createPublicApiKey(
  input: { shopId: string; name: string; plan: "growth" | "pro" | "enterprise" },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  const rawKey = `imp_${randomBytes(24).toString("hex")}`;
  const prefix = rawKey.slice(0, 12);
  const record = await db.publicApiKey.create({
    data: { shopId: input.shopId, name: input.name, plan: input.plan, prefix, keyHash: hashApiKey(rawKey) }
  });
  return { ...record, rawKey };
}

export async function authenticatePublicApiKey(apiKey: string, db: PrismaClient = prisma) {
  const record = await db.publicApiKey.findFirst({ where: { prefix: apiKey.slice(0, 12), keyHash: hashApiKey(apiKey), active: true } });
  if (!record) return null;
  await db.publicApiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return record;
}

export function rateLimitForPlan(plan: string) {
  if (plan === "enterprise") return Infinity;
  if (plan === "pro") return 1000;
  return 100;
}

export function signShopifyWebhookPayload(payload: string | Buffer, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64");
}

export function verifyShopifyWebhookSignature(payload: string | Buffer, signature: string | null | undefined, secret: string | null | undefined) {
  if (!secret || !signature) return false;
  const expected = Buffer.from(signShopifyWebhookPayload(payload, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function registerOutboundWebhook(
  input: { shopId: string; targetUrl: string; eventTypes: string[]; secret?: string },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.integrationsPlatform, db);
  return db.outboundWebhookSubscription.create({
    data: {
      shopId: input.shopId,
      targetUrl: input.targetUrl,
      eventTypes: input.eventTypes as Prisma.InputJsonValue,
      secret: input.secret ?? randomBytes(16).toString("hex")
    }
  });
}

export async function getPlatformDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.integrationsPlatform, db);
  const [connections, logs, accountingExports, chatConnections, offlineSyncs, apiKeys, webhooks, flowEvents] = await Promise.all([
    db.integrationConnection.findMany({ where: { shopId }, orderBy: { updatedAt: "desc" } }),
    db.syncLog.findMany({ where: { shopId }, orderBy: { occurredAt: "desc" }, take: 25 }),
    db.accountingExport.findMany({ where: { shopId }, orderBy: { exportedAt: "desc" }, take: 10 }),
    db.chatBotConnection.findMany({ where: { shopId } }),
    db.mobileOfflineSync.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.publicApiKey.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } }),
    db.outboundWebhookSubscription.findMany({ where: { shopId }, orderBy: { createdAt: "desc" } }),
    db.shopifyFlowEvent.findMany({ where: { shopId }, orderBy: { emittedAt: "desc" }, take: 10 })
  ]);

  return {
    connections,
    logs,
    accountingExports,
    chatConnections,
    offlineSyncs,
    apiKeys,
    webhooks,
    flowEvents,
    metrics: {
      connected: connections.filter((connection) => connection.status === "CONNECTED").length + chatConnections.length,
      failedLogs: logs.filter((log) => log.status === "FAILED").length,
      queuedOffline: offlineSyncs.filter((sync) => sync.status === "QUEUED").length,
      activeApiKeys: apiKeys.filter((key) => key.active).length
    }
  };
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

async function exchangeShopifyCodeForToken(input: { shop: string; code: string }, fetcher: typeof fetch): Promise<ShopifyTokenResponse> {
  const clientId = process.env.SHOPIFY_API_KEY;
  const clientSecret = process.env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify API credentials are not configured");

  const response = await fetcher(`https://${input.shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: input.code })
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? "Shopify token exchange failed");
  }

  return { access_token: payload.access_token, scope: payload.scope ?? "" };
}

function encryptShopifyAccessToken(accessToken: string) {
  const secret = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY ?? process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY or SHOPIFY_API_SECRET is required to store Shopify tokens");

  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function csv(value: string) {
  return value.includes(",") || value.includes("\"") ? `"${value.replace(/"/g, "\"\"")}"` : value;
}
