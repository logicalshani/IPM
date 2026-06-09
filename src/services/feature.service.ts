import type { FeatureStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const FEATURE_KEYS = {
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
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ALL_FEATURE_KEYS = Object.values(FEATURE_KEYS) as FeatureKey[];

export async function isFeatureEnabled(
  shopId: string,
  key: FeatureKey,
  db: PrismaClient = prisma
) {
  if (db === prisma && !process.env.DATABASE_URL) {
    return false;
  }

  const feature = await db.feature.findUnique({
    where: { shopId_key: { shopId, key } },
    select: { status: true }
  });

  return feature?.status === "ENABLED";
}

export async function assertFeatureEnabled(
  shopId: string,
  key: FeatureKey,
  db: PrismaClient = prisma
) {
  const enabled = await isFeatureEnabled(shopId, key, db);
  if (!enabled) {
    throw new Error(`Feature ${key} is not enabled for this shop`);
  }
}

export async function upsertFeature(
  input: {
    shopId: string;
    key: FeatureKey;
    plan: string;
    status: FeatureStatus;
    config?: Prisma.InputJsonValue;
  },
  db: PrismaClient = prisma
) {
  return db.feature.upsert({
    where: { shopId_key: { shopId: input.shopId, key: input.key } },
    create: input,
    update: {
      plan: input.plan,
      status: input.status,
      config: input.config
    }
  });
}

export async function enableAllFeaturesForShop(shopId: string, plan: string, db: PrismaClient = prisma) {
  const features = [];
  const batchSize = 5;
  for (let index = 0; index < ALL_FEATURE_KEYS.length; index += batchSize) {
    const batch = ALL_FEATURE_KEYS.slice(index, index + batchSize);
    features.push(
      ...(await Promise.all(
        batch.map((key) =>
          upsertFeature(
            {
              shopId,
              key,
              plan,
              status: "ENABLED"
            },
            db
          )
        )
      ))
    );
  }
  return features;
}
