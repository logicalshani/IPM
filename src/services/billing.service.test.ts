import { describe, expect, it, vi } from "vitest";
import { BILLING_PLANS, calculateSkuOverage, canAccessBillingFeature, getBillingDashboard, upsertBillingPlans } from "./billing.service";

describe("billing.service", () => {
  it("defines the requested billing tiers and transparent SKU overage", () => {
    expect(BILLING_PLANS.STARTER.monthlyPriceCents).toBe(2900);
    expect(BILLING_PLANS.GROWTH.skuLimit).toBe(2000);
    expect(BILLING_PLANS.PRO.features).toContain("AI consultant");
    expect(BILLING_PLANS.AGENCY.features).toContain("White-label");
    expect(BILLING_PLANS.ENTERPRISE.monthlyPriceCents).toBeNull();
    expect(calculateSkuOverage("GROWTH", 2105)).toMatchObject({ overageSkus: 105, overageAmountCents: 105 });
  });

  it("enforces billing feature access per plan", () => {
    expect(canAccessBillingFeature("STARTER", "dashboard")).toBe(true);
    expect(canAccessBillingFeature("STARTER", "purchaseOrders")).toBe(false);
    expect(canAccessBillingFeature("GROWTH", "purchaseOrders")).toBe(true);
    expect(canAccessBillingFeature("PRO", "aiConsultant")).toBe(true);
    expect(canAccessBillingFeature("PRO", "whiteLabel")).toBe(false);
    expect(canAccessBillingFeature("AGENCY", "whiteLabel")).toBe(true);
    expect(canAccessBillingFeature("ENTERPRISE", "publicApi")).toBe(true);
  });

  it("upserts all billing plans", async () => {
    const db = {
      billingPlan: { upsert: vi.fn().mockResolvedValue({ id: "plan_1" }) }
    } as any;

    await upsertBillingPlans(db);

    expect(db.billingPlan.upsert).toHaveBeenCalledTimes(5);
    expect(db.billingPlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { key: "AGENCY" } }));
  });

  it("builds a usage dashboard from subscription and counts", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      subscription: {
        findFirst: vi.fn().mockResolvedValue({ storeCount: 1, billingPlan: { key: "STARTER" } })
      },
      product: { count: vi.fn().mockResolvedValue(640) },
      location: { count: vi.fn().mockResolvedValue(2) }
    } as any;

    const dashboard = await getBillingDashboard("shop_1", db);

    expect(dashboard.usage.overageSkus).toBe(140);
    expect(dashboard.usage.overageAmountCents).toBe(140);
  });
});
