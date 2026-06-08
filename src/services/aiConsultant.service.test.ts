import { describe, expect, it, vi } from "vitest";
import {
  calculateReorderRecommendations,
  classifyConsultantIntent,
  optimizeBudgetPurchases,
  recordAIConsultationFeedback
} from "./aiConsultant.service";

const snapshot = {
  generatedAt: new Date().toISOString(),
  products: [
    {
      id: "p1",
      sku: "TEE-1",
      name: "Core Tee",
      category: "Apparel",
      supplierName: "Threadhouse",
      quantityOnHand: 20,
      price: 30,
      cost: 10,
      inventoryValue: 200,
      grossMargin: 20,
      dailyDemand: 4,
      daysOfStockLeft: 5,
      daysSinceLastSale: 1,
      returnRate: 5,
      expiryDate: null,
      leadTimeDays: 14
    }
  ],
  suppliers: []
};

describe("aiConsultant.service", () => {
  it("classifies supported consultant queries", () => {
    expect(classifyConsultantIntent("I have $5,000 — what should I buy?")).toBe("budget_optimization");
    expect(classifyConsultantIntent("Who is my most unreliable supplier?")).toBe("supplier_reliability");
  });

  it("builds reorder tables with costs and profit impact", () => {
    const result = calculateReorderRecommendations(snapshot);
    expect(result.table[0]).toMatchObject({ SKU: "TEE-1", "Reorder qty": 92, "Estimated cost": 920 });
  });

  it("optimizes purchases inside a budget", () => {
    const result = optimizeBudgetPurchases(snapshot, 1000);
    expect(result.table).toHaveLength(1);
  });

  it("skips reorder candidates that exceed the budget", () => {
    const result = optimizeBudgetPurchases(snapshot, 500);
    expect(result.table).toHaveLength(0);
    expect(result.confidence).toBe("Low");
    expect(result.summary).toContain("Allocated $0");
  });

  it("records thumbs feedback through the service layer", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      aIConsultationSession: { update: vi.fn().mockResolvedValue({ id: "ai_1" }) }
    } as any;

    await recordAIConsultationFeedback({ shopId: "shop_1", sessionId: "ai_1", feedback: "THUMBS_UP" }, db);
    expect(db.aIConsultationSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { feedback: "THUMBS_UP", feedbackNote: undefined } })
    );
  });
});
