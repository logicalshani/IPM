import { describe, expect, it, vi } from "vitest";
import { FEATURE_KEYS, assertFeatureEnabled, isFeatureEnabled, upsertFeature } from "./feature.service";

describe("feature.service", () => {
  it("detects enabled feature flags", async () => {
    const db = {
      feature: {
        findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" })
      }
    } as any;

    await expect(isFeatureEnabled("shop_1", FEATURE_KEYS.stocktakes, db)).resolves.toBe(true);
  });

  it("blocks disabled modules", async () => {
    const db = {
      feature: {
        findUnique: vi.fn().mockResolvedValue({ status: "DISABLED" })
      }
    } as any;

    await expect(assertFeatureEnabled("shop_1", FEATURE_KEYS.barcodeSystem, db)).rejects.toThrow(
      "not enabled"
    );
  });

  it("upserts plan-scoped feature state", async () => {
    const db = {
      feature: {
        upsert: vi.fn().mockResolvedValue({ key: FEATURE_KEYS.aiInsights })
      }
    } as any;

    await upsertFeature(
      { shopId: "shop_1", key: FEATURE_KEYS.aiInsights, plan: "growth", status: "ENABLED" },
      db
    );

    expect(db.feature.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shopId_key: { shopId: "shop_1", key: FEATURE_KEYS.aiInsights } }
      })
    );
  });
});
