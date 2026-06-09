import { Queue } from "bullmq";

const connection = shouldCreateRedisQueues() && process.env.REDIS_URL ? redisConnectionFromUrl(process.env.REDIS_URL) : undefined;

type RedisQueueEnv = {
  REDIS_URL?: string;
  NEXT_PHASE?: string;
  DISABLE_REDIS_QUEUES?: string;
  NODE_ENV?: string;
  VITEST?: string;
};

export const QUEUE_NAMES = {
  shopifySync: "shopify-sync",
  forecastEngine: "forecast-engine",
  alertEngine: "alert-engine",
  reorderEngine: "reorder-engine",
  aiAnalysis: "ai-analysis",
  reportGen: "report-gen",
  migration: "migration",
  competitorScrape: "competitor-scrape",
  invoiceParse: "invoice-parse",
  threePlSync: "3pl-sync",
  emailDigest: "email-digest",
  purchaseOrders: "purchase-orders",
  platformIntegrations: "platform-integrations"
} as const;

export const QUEUE_SCHEDULES = [
  { queue: QUEUE_NAMES.shopifySync, trigger: "webhook_or_manual", jobs: ["pull-products", "pull-variants", "pull-inventory-levels", "pull-orders"] },
  { queue: QUEUE_NAMES.forecastEngine, trigger: "nightly_2am", cron: "0 2 * * *", jobs: ["recalculate-demand-forecast-per-sku"] },
  { queue: QUEUE_NAMES.alertEngine, trigger: "every_30_min", cron: "*/30 * * * *", jobs: ["evaluate-alert-rules", "fire-notifications"] },
  { queue: QUEUE_NAMES.reorderEngine, trigger: "nightly_3am", cron: "0 3 * * *", jobs: ["generate-reorder-suggestions"] },
  { queue: QUEUE_NAMES.aiAnalysis, trigger: "on_demand", jobs: ["run-ai-consultant-analysis"] },
  { queue: QUEUE_NAMES.reportGen, trigger: "scheduled_or_on_demand", jobs: ["generate-report", "email-report"] },
  { queue: QUEUE_NAMES.migration, trigger: "on_demand", jobs: ["process-stocky-csv-migration", "rollback-migration"] },
  { queue: QUEUE_NAMES.competitorScrape, trigger: "weekly", cron: "0 4 * * 1", jobs: ["scrape-competitor-prices"] },
  { queue: QUEUE_NAMES.invoiceParse, trigger: "on_upload", jobs: ["parse-invoice-with-gpt-4o-vision"] },
  { queue: QUEUE_NAMES.threePlSync, trigger: "daily", cron: "0 5 * * *", jobs: ["pull-3pl-inventory-levels"] },
  { queue: QUEUE_NAMES.emailDigest, trigger: "daily_8am", cron: "0 8 * * *", jobs: ["send-merchant-daily-inventory-digest"] }
] as const;

export const shopifySyncQueue = makeQueue(QUEUE_NAMES.shopifySync);
export const forecastEngineQueue = makeQueue(QUEUE_NAMES.forecastEngine);
export const alertEngineQueue = makeQueue(QUEUE_NAMES.alertEngine);
export const reorderEngineQueue = makeQueue(QUEUE_NAMES.reorderEngine);
export const aiAnalysisQueue = makeQueue(QUEUE_NAMES.aiAnalysis);
export const reportGenQueue = makeQueue(QUEUE_NAMES.reportGen);
export const migrationQueue = makeQueue(QUEUE_NAMES.migration);
export const competitorScrapeQueue = makeQueue(QUEUE_NAMES.competitorScrape);
export const invoiceParseQueue = makeQueue(QUEUE_NAMES.invoiceParse);
export const threePlSyncQueue = makeQueue(QUEUE_NAMES.threePlSync);
export const emailDigestQueue = makeQueue(QUEUE_NAMES.emailDigest);
export const purchaseOrderQueue = makeQueue(QUEUE_NAMES.purchaseOrders);
export const platformIntegrationQueue = makeQueue(QUEUE_NAMES.platformIntegrations);

export const inventorySyncQueue = shopifySyncQueue;

function makeQueue(name: string) {
  return connection ? new Queue(name, { connection }) : undefined;
}

export function shouldCreateRedisQueues(env: RedisQueueEnv = process.env as RedisQueueEnv) {
  return Boolean(env.REDIS_URL) && env.NEXT_PHASE !== "phase-production-build" && env.DISABLE_REDIS_QUEUES !== "1" && env.NODE_ENV !== "test" && env.VITEST !== "true";
}

function redisConnectionFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null
  };
}
