import type { BillingPlanKey, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export const BILLING_PLANS = {
  STARTER: {
    key: "STARTER",
    name: "Starter",
    monthlyPriceCents: 2900,
    skuLimit: 500,
    locationLimit: 1,
    storeLimit: 1,
    features: ["Dashboard", "Alerts", "Basic reports"]
  },
  GROWTH: {
    key: "GROWTH",
    name: "Growth",
    monthlyPriceCents: 7900,
    skuLimit: 2000,
    locationLimit: 3,
    storeLimit: 1,
    features: ["Forecasting", "Purchase orders", "Suppliers", "Stocktakes", "Barcode"]
  },
  PRO: {
    key: "PRO",
    name: "Pro",
    monthlyPriceCents: 19900,
    skuLimit: null,
    locationLimit: null,
    storeLimit: 1,
    features: ["AI consultant", "Dead/overstock", "ABC", "Multi-location", "Returns", "3PL"]
  },
  AGENCY: {
    key: "AGENCY",
    name: "Agency",
    monthlyPriceCents: 29900,
    skuLimit: null,
    locationLimit: null,
    storeLimit: 3,
    features: ["White-label", "3 stores", "Partner portal"]
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    name: "Enterprise",
    monthlyPriceCents: null,
    skuLimit: null,
    locationLimit: null,
    storeLimit: null,
    features: ["Multi-store", "Public API", "Custom AI training", "SLA", "Dedicated support"]
  }
} as const;

export const SKU_OVERAGE_CENTS = 1;

export const BILLING_FEATURE_ACCESS = {
  dashboard: ["STARTER", "GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  alerts: ["STARTER", "GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  basicReports: ["STARTER", "GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  forecasting: ["GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  purchaseOrders: ["GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  suppliers: ["GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  stocktakes: ["GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  barcode: ["GROWTH", "PRO", "AGENCY", "ENTERPRISE"],
  aiConsultant: ["PRO", "AGENCY", "ENTERPRISE"],
  returns: ["PRO", "AGENCY", "ENTERPRISE"],
  threePl: ["PRO", "AGENCY", "ENTERPRISE"],
  whiteLabel: ["AGENCY", "ENTERPRISE"],
  multiStore: ["ENTERPRISE"],
  publicApi: ["ENTERPRISE"],
  customAiTraining: ["ENTERPRISE"]
} as const;

export type BillingFeature = keyof typeof BILLING_FEATURE_ACCESS;

export function calculateSkuOverage(planKey: BillingPlanKey, skuCount: number) {
  const plan = BILLING_PLANS[planKey];
  const limit = plan.skuLimit;
  const overageSkus = limit === null ? 0 : Math.max(0, skuCount - limit);
  return {
    planKey,
    skuCount,
    skuLimit: limit,
    overageSkus,
    overageAmountCents: overageSkus * SKU_OVERAGE_CENTS,
    overageRateCents: SKU_OVERAGE_CENTS
  };
}

export function canAccessBillingFeature(planKey: BillingPlanKey, feature: BillingFeature) {
  return (BILLING_FEATURE_ACCESS[feature] as readonly string[]).includes(planKey);
}

export async function upsertBillingPlans(db: PrismaClient = prisma) {
  return Promise.all(
    Object.values(BILLING_PLANS).map((plan) =>
      db.billingPlan.upsert({
        where: { key: plan.key },
        create: {
          key: plan.key,
          name: plan.name,
          monthlyPriceCents: plan.monthlyPriceCents ?? 0,
          skuLimit: plan.skuLimit ?? undefined,
          locationLimit: plan.locationLimit ?? undefined,
          storeLimit: plan.storeLimit ?? undefined,
          features: plan.features,
          overageSkuCents: SKU_OVERAGE_CENTS
        },
        update: {
          name: plan.name,
          monthlyPriceCents: plan.monthlyPriceCents ?? 0,
          skuLimit: plan.skuLimit ?? undefined,
          locationLimit: plan.locationLimit ?? undefined,
          storeLimit: plan.storeLimit ?? undefined,
          features: plan.features,
          overageSkuCents: SKU_OVERAGE_CENTS,
          active: true
        }
      })
    )
  );
}

export async function getBillingDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.billingPlans, db);
  const [subscription, skuCount, locationCount] = await Promise.all([
    db.subscription.findFirst({ where: { shopId, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } }, include: { billingPlan: true }, orderBy: { updatedAt: "desc" } }),
    db.product.count({ where: { shopId } }),
    db.location.count({ where: { shopId } })
  ]);
  const planKey = (subscription?.billingPlan.key ?? "GROWTH") as BillingPlanKey;
  const overage = calculateSkuOverage(planKey, skuCount);

  return {
    subscription,
    plan: BILLING_PLANS[planKey],
    usage: {
      locationCount,
      storeCount: subscription?.storeCount ?? 1,
      ...overage
    },
    plans: Object.values(BILLING_PLANS)
  };
}
