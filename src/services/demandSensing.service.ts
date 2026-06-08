import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FEATURE_KEYS, assertFeatureEnabled } from "./feature.service";

export async function upsertDemandProfile(
  input: {
    shopId: string;
    productId: string;
    baselineDailyDemand?: number;
    salesVelocity30d?: number;
    returnRate?: number;
    activeDiscountPercent?: number;
    merchantProxyDemand?: number;
    restockHaloMultiplier?: number;
    daysSinceLastSale?: number;
    lastSaleAt?: Date;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.demandSensing, db);

  return db.productDemandProfile.upsert({
    where: { productId: input.productId },
    create: input,
    update: {
      baselineDailyDemand: input.baselineDailyDemand,
      salesVelocity30d: input.salesVelocity30d,
      returnRate: input.returnRate,
      activeDiscountPercent: input.activeDiscountPercent,
      merchantProxyDemand: input.merchantProxyDemand,
      restockHaloMultiplier: input.restockHaloMultiplier,
      daysSinceLastSale: input.daysSinceLastSale,
      lastSaleAt: input.lastSaleAt
    }
  });
}

export async function ingestDemandSignal(
  input: {
    shopId: string;
    productId?: string;
    keyword: string;
    type: "GOOGLE_TRENDS" | "SHOPIFY_DISCOUNT" | "RETURN_RATE" | "SEASONALITY" | "RESTOCK_HALO" | "MERCHANT_PROXY";
    score: number;
    metadata?: Prisma.InputJsonValue;
  },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.demandSensing, db);

  return db.demandSignal.create({ data: input });
}

export async function ingestGoogleTrendsSignal(
  input: { shopId: string; productId?: string; keyword: string; trendScore?: number },
  db: PrismaClient = prisma
) {
  const score = input.trendScore ?? 0;
  return ingestDemandSignal(
    {
      shopId: input.shopId,
      productId: input.productId,
      keyword: input.keyword,
      type: "GOOGLE_TRENDS",
      score,
      metadata: { source: "google_trends_api_placeholder" }
    },
    db
  );
}

export async function generateDemandForecast(
  input: { shopId: string; productId: string; horizonDays: number; seasonalMultiplier?: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.demandSensing, db);

  const product = await db.product.findUniqueOrThrow({
    where: { id: input.productId, shopId: input.shopId },
    include: {
      demandProfile: true,
      movements: { where: { occurredAt: { gte: daysAgo(180) } }, orderBy: { occurredAt: "asc" } }
    }
  });
  const signals = await db.demandSignal.findMany({
    where: { shopId: input.shopId, OR: [{ productId: input.productId }, { productId: null }] },
    orderBy: { observedAt: "desc" },
    take: 20
  });

  const salesByDay = buildDailySalesSeries(product.movements);
  const components = decomposeDemand(salesByDay);
  const profile = product.demandProfile;
  const coldStartDemand =
    salesByDay.length < 30 ? Number(profile?.merchantProxyDemand ?? profile?.baselineDailyDemand ?? categoryAverage(product.category ?? "")) : components.trend;
  const externalTrendScore = Number(signals.find((signal) => signal.type === "GOOGLE_TRENDS")?.score ?? 0);
  const returnRate = Number(profile?.returnRate ?? 0);
  const activeDiscount = Number(profile?.activeDiscountPercent ?? 0);
  const restockHalo = Number(profile?.restockHaloMultiplier ?? 1);
  const baselineDemand = Math.max(coldStartDemand, Number(profile?.baselineDailyDemand ?? 0), 0.1);
  const adjustedDailyDemand =
    baselineDemand *
    (1 + externalTrendScore / 100) *
    (input.seasonalMultiplier ?? Math.max(components.seasonality, 0.8)) *
    (1 - returnRate / 100) *
    (1 - activeDiscount / 200) *
    restockHalo;
  const adjustedDemand = Math.max(0, adjustedDailyDemand * input.horizonDays);
  const forecastValue = adjustedDemand * Number(product.price);
  const confidence = salesByDay.length >= 90 ? "High" : salesByDay.length >= 30 ? "Medium" : "Low";

  return db.demandForecast.create({
    data: {
      shopId: input.shopId,
      productId: input.productId,
      horizonDays: input.horizonDays,
      baselineDemand: baselineDemand * input.horizonDays,
      adjustedDemand,
      trendSignal: components.trend,
      seasonalitySignal: components.seasonality,
      noiseSignal: components.noise,
      externalTrendScore,
      returnRateAdjustment: -returnRate,
      discountAdjustment: -activeDiscount / 2,
      restockHaloAdjustment: (restockHalo - 1) * 100,
      forecastValue,
      modelConfidence: confidence
    }
  });
}

export async function recordForecastAccuracy(
  input: { shopId: string; productId: string; month: Date; forecastDemand: number; actualDemand: number },
  db: PrismaClient = prisma
) {
  await assertFeatureEnabled(input.shopId, FEATURE_KEYS.demandSensing, db);

  const mape = calculateMape(input.forecastDemand, input.actualDemand);
  return db.forecastAccuracy.upsert({
    where: { productId_month: { productId: input.productId, month: startOfMonth(input.month) } },
    create: {
      shopId: input.shopId,
      productId: input.productId,
      month: startOfMonth(input.month),
      forecastDemand: input.forecastDemand,
      actualDemand: input.actualDemand,
      mape,
      tuningSuggestion: tuningSuggestion(mape)
    },
    update: {
      forecastDemand: input.forecastDemand,
      actualDemand: input.actualDemand,
      mape,
      tuningSuggestion: tuningSuggestion(mape)
    }
  });
}

export async function getDemandForecastDashboard(shopId: string, db: PrismaClient = prisma) {
  await assertFeatureEnabled(shopId, FEATURE_KEYS.demandSensing, db);

  const [forecasts, accuracy] = await Promise.all([
    db.demandForecast.findMany({ where: { shopId }, include: { product: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.forecastAccuracy.findMany({ where: { shopId }, include: { product: true }, orderBy: { mape: "desc" }, take: 50 })
  ]);

  return {
    forecasts,
    accuracy,
    poorAccuracy: accuracy.filter((row) => Number(row.mape) > 25),
    averageMape: accuracy.length ? round(accuracy.reduce((sum, row) => sum + Number(row.mape), 0) / accuracy.length) : 0
  };
}

export function decomposeDemand(values: number[]) {
  if (values.length === 0) {
    return { trend: 0, seasonality: 1, noise: 0 };
  }
  const smoothed = exponentialSmooth(values, 0.35);
  const trend = smoothed[smoothed.length - 1] ?? values[values.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const recent = values.slice(-14).reduce((sum, value) => sum + value, 0) / Math.max(values.slice(-14).length, 1);
  const seasonality = average === 0 ? 1 : recent / average;
  const noise = values.reduce((sum, value, index) => sum + Math.abs(value - (smoothed[index] ?? value)), 0) / values.length;
  return { trend: round(trend), seasonality: round(seasonality), noise: round(noise) };
}

export function calculateMape(forecast: number, actual: number) {
  if (actual === 0) return forecast === 0 ? 0 : 100;
  return round(Math.abs((actual - forecast) / actual) * 100);
}

function buildDailySalesSeries(movements: Array<{ type: string; quantity: number; occurredAt: Date }>) {
  const byDay = new Map<string, number>();
  for (const movement of movements) {
    const key = movement.occurredAt.toISOString().slice(0, 10);
    const value = movement.type === "SALE" ? Math.abs(movement.quantity) : movement.type === "RETURN" ? -Math.abs(movement.quantity) : 0;
    byDay.set(key, (byDay.get(key) ?? 0) + value);
  }
  return [...byDay.values()].map((value) => Math.max(0, value));
}

function exponentialSmooth(values: number[], alpha: number) {
  return values.reduce<number[]>((series, value, index) => {
    if (index === 0) return [value];
    series.push(alpha * value + (1 - alpha) * series[index - 1]);
    return series;
  }, []);
}

function categoryAverage(_category: string) {
  return 1;
}

function tuningSuggestion(mape: number) {
  if (mape > 40) return "Increase merchant proxy input or split promotional demand from baseline.";
  if (mape > 25) return "Review external trend and return-rate adjustments.";
  return "Model is within acceptable tolerance.";
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function round(value: number) {
  return Number(value.toFixed(2));
}
