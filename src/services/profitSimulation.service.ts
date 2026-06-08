import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export type ScenarioOptionInput = {
  productId?: string;
  supplierName: string;
  label: string;
  orderQuantity: number;
  supplierPrice: number;
  sellingPrice: number;
  expectedSellThrough: number;
  timeframeDays: number;
  runMonteCarlo?: boolean;
};

export async function saveProfitScenario(
  input: { shopId: string; name: string; timeframeDays: number; budget?: number; notes?: string; options: ScenarioOptionInput[] },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.profitSimulation, db);

  return db.profitScenario.create({
    data: {
      shopId: input.shopId,
      name: input.name,
      timeframeDays: input.timeframeDays,
      budget: input.budget,
      notes: input.notes,
      options: {
        create: input.options.map((option) => {
          const projection = simulateProfitOption(option);
          return {
            productId: option.productId,
            supplierName: option.supplierName,
            label: option.label,
            orderQuantity: option.orderQuantity,
            supplierPrice: option.supplierPrice,
            sellingPrice: option.sellingPrice,
            expectedSellThrough: option.expectedSellThrough,
            ...projection,
            monteCarloJson: option.runMonteCarlo ? runMonteCarlo(option, 1000) : undefined
          };
        })
      }
    },
    include: { options: true }
  });
}

export function simulateProfitOption(option: ScenarioOptionInput) {
  const soldUnits = Math.round(option.orderQuantity * option.expectedSellThrough);
  const revenue = soldUnits * option.sellingPrice;
  const cost = option.orderQuantity * option.supplierPrice;
  const projectedGrossProfit = revenue - soldUnits * option.supplierPrice;
  const unsoldCapital = (option.orderQuantity - soldUnits) * option.supplierPrice;
  const breakEvenUnits = Math.ceil(cost / Math.max(option.sellingPrice - option.supplierPrice, 0.01));
  const paybackPeriodDays = Math.ceil((breakEvenUnits / Math.max(soldUnits, 1)) * option.timeframeDays);

  return {
    projectedGrossProfit: round(projectedGrossProfit),
    capitalAtRisk: round(unsoldCapital),
    breakEvenUnits,
    paybackPeriodDays,
    cashFlowImpact: round(revenue - cost)
  };
}

export function runMonteCarlo(option: ScenarioOptionInput, iterations: number) {
  const profits = [];
  for (let index = 0; index < iterations; index += 1) {
    const demandFactor = 0.65 + pseudoRandom(index) * 0.7;
    const sellThrough = Math.min(1, Math.max(0, option.expectedSellThrough * demandFactor));
    profits.push(simulateProfitOption({ ...option, expectedSellThrough: sellThrough }).projectedGrossProfit);
  }
  profits.sort((a, b) => a - b);
  return {
    iterations,
    p10: profits[Math.floor(iterations * 0.1)],
    p50: profits[Math.floor(iterations * 0.5)],
    p90: profits[Math.floor(iterations * 0.9)],
    probabilityProfit: round((profits.filter((profit) => profit > 0).length / iterations) * 100)
  };
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function round(value: number) {
  return Number(value.toFixed(2));
}
