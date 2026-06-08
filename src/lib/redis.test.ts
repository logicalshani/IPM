import { describe, expect, it } from "vitest";
import { QUEUE_NAMES, QUEUE_SCHEDULES } from "./redis";

describe("redis queue registry", () => {
  it("declares the complete background job system", () => {
    expect(Object.values(QUEUE_NAMES)).toEqual(
      expect.arrayContaining([
        "shopify-sync",
        "forecast-engine",
        "alert-engine",
        "reorder-engine",
        "ai-analysis",
        "report-gen",
        "migration",
        "competitor-scrape",
        "invoice-parse",
        "3pl-sync",
        "email-digest"
      ])
    );
    expect(QUEUE_SCHEDULES).toContainEqual(expect.objectContaining({ queue: "forecast-engine", cron: "0 2 * * *" }));
    expect(QUEUE_SCHEDULES).toContainEqual(expect.objectContaining({ queue: "email-digest", cron: "0 8 * * *" }));
  });
});
