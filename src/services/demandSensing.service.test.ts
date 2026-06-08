import { describe, expect, it, vi } from "vitest";
import { calculateMape, decomposeDemand, ingestGoogleTrendsSignal, recordForecastAccuracy } from "./demandSensing.service";

describe("demandSensing.service", () => {
  it("decomposes demand into trend, seasonality, and noise", () => {
    const result = decomposeDemand([1, 2, 3, 4, 5, 6, 7]);
    expect(result.trend).toBeGreaterThan(1);
    expect(result.seasonality).toBeGreaterThan(0);
  });

  it("calculates MAPE", () => {
    expect(calculateMape(80, 100)).toBe(20);
    expect(calculateMape(0, 0)).toBe(0);
    expect(calculateMape(25, 0)).toBe(100);
  });

  it("stores Google Trends signals through the service layer", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      demandSignal: { create: vi.fn().mockResolvedValue({ id: "signal_1" }) }
    } as any;

    await ingestGoogleTrendsSignal({ shopId: "shop_1", keyword: "canvas tote", trendScore: 35 }, db);
    expect(db.demandSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "GOOGLE_TRENDS", score: 35 }) })
    );
  });

  it("records forecast accuracy with tuning suggestions", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      forecastAccuracy: { upsert: vi.fn().mockResolvedValue({ id: "acc_1" }) }
    } as any;

    await recordForecastAccuracy(
      { shopId: "shop_1", productId: "p1", month: new Date("2026-05-15"), forecastDemand: 50, actualDemand: 100 },
      db
    );
    expect(db.forecastAccuracy.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ mape: 50 }) })
    );
  });
});
