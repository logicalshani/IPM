import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: { title: "Inventory Manager Pro Public API", version: "1.0.0" },
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      schemas: {
        InventoryItem: { type: "object", properties: { sku: { type: "string" }, quantity: { type: "integer" } } },
        Supplier: { type: "object", properties: { name: { type: "string" }, reliabilityScore: { type: "number" } } },
        PurchaseOrder: { type: "object", properties: { poNumber: { type: "string" }, status: { type: "string" } } }
      }
    },
    paths: {
      "/api/auth/shopify": {
        get: {
          summary: "Start Shopify OAuth install",
          parameters: [{ name: "shop", in: "query", required: true, schema: { type: "string", example: "store.myshopify.com" } }],
          responses: { "307": { description: "Redirects to Shopify OAuth authorization" } }
        }
      },
      "/api/auth/shopify/callback": {
        get: {
          summary: "Complete Shopify OAuth install",
          responses: { "307": { description: "Redirects back to the Platform console with success or error state" } }
        }
      },
      "/api/public/inventory": publicPath("Inventory levels and product inventory"),
      "/api/public/suppliers": publicPath("Supplier records"),
      "/api/public/purchase-orders": publicPath("Purchase orders"),
      "/api/public/stock-counts": publicPath("Stocktake sessions and count lines"),
      "/api/public/alerts": publicPath("Open IMP alerts")
    },
    "x-rate-limits": {
      Growth: "100 req/min",
      Pro: "1,000 req/min",
      Enterprise: "Unlimited"
    }
  });
}

function publicPath(description: string) {
  return {
    get: { summary: `List ${description}`, responses: { "200": { description: "OK" } } },
    post: { summary: `Create or update ${description}`, responses: { "202": { description: "Accepted" } } }
  };
}
