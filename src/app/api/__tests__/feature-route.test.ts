import { createServer } from "node:http";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/feature.service", () => ({
  ALL_FEATURE_KEYS: [
    "inventory.stocktakes",
    "inventory.barcodes",
    "inventory.ai_insights",
    "suppliers.intelligence",
    "suppliers.pricing",
    "suppliers.communications",
    "ai.consultant",
    "ai.demand_sensing",
    "ai.invoice_parser",
    "ai.profit_simulation",
    "ai.competitor_monitor",
    "purchase_orders.enterprise",
    "financial.intelligence",
    "operations.intelligence",
    "analytics.reporting",
    "integrations.platform",
    "platform.infrastructure",
    "roles.compliance",
    "platform.stocky_migration",
    "billing.plans"
  ],
  FEATURE_KEYS: {
    stocktakes: "inventory.stocktakes",
    barcodeSystem: "inventory.barcodes",
    aiInsights: "inventory.ai_insights",
    supplierIntelligence: "suppliers.intelligence",
    supplierPricing: "suppliers.pricing",
    supplierCommunications: "suppliers.communications",
    aiConsultant: "ai.consultant",
    demandSensing: "ai.demand_sensing",
    invoiceParser: "ai.invoice_parser",
    profitSimulation: "ai.profit_simulation",
    competitorMonitor: "ai.competitor_monitor",
    purchaseOrders: "purchase_orders.enterprise",
    financialIntelligence: "financial.intelligence",
    operationsIntelligence: "operations.intelligence",
    analyticsReporting: "analytics.reporting",
    integrationsPlatform: "integrations.platform",
    platformInfrastructure: "platform.infrastructure",
    rolesCompliance: "roles.compliance",
    stockyMigration: "platform.stocky_migration",
    billingPlans: "billing.plans"
  },
  upsertFeature: vi.fn().mockResolvedValue({ key: "inventory.stocktakes", status: "ENABLED" })
}));

describe("feature route contract", () => {
  it("validates feature toggle payloads with supertest", async () => {
    const server = createServer(async (req, res) => {
      const { POST } = await import("../features/route");
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await POST(
        new Request("http://localhost/api/features", {
          method: "POST",
          body: Buffer.concat(chunks),
          headers: { "Content-Type": "application/json" }
        })
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      res.end(await response.text());
    });

    await request(server)
      .post("/")
      .send({ shopId: "shop_1", key: "inventory.stocktakes", plan: "growth", status: "ENABLED" })
      .expect(201)
      .expect((response) => {
        expect(response.body.data.status).toBe("ENABLED");
      });
  });
});
