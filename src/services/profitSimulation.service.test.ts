import { describe, expect, it } from "vitest";
import { runMonteCarlo, simulateProfitOption } from "./profitSimulation.service";

describe("profitSimulation.service", () => {
  it("calculates scenario outputs", () => {
    const result = simulateProfitOption({
      supplierName: "A",
      label: "Order 500",
      orderQuantity: 500,
      supplierPrice: 8,
      sellingPrice: 20,
      expectedSellThrough: 0.8,
      timeframeDays: 60
    });
    expect(result.projectedGrossProfit).toBe(4800);
    expect(result.breakEvenUnits).toBe(334);
  });

  it("runs deterministic Monte Carlo distributions", () => {
    const result = runMonteCarlo(
      {
        supplierName: "A",
        label: "Order 500",
        orderQuantity: 500,
        supplierPrice: 8,
        sellingPrice: 20,
        expectedSellThrough: 0.8,
        timeframeDays: 60
      },
      1000
    );
    expect(result.iterations).toBe(1000);
    expect(result.probabilityProfit).toBeGreaterThan(0);
  });
});
