import { describe, expect, it, vi } from "vitest";
import { streamInventoryInsights } from "./aiInventory.service";

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude-model") }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "openai-model") }));
vi.mock("ai", () => ({ streamText: vi.fn(() => ({ toDataStreamResponse: vi.fn() })) }));

describe("aiInventory.service", () => {
  it("feature gates AI inventory analysis and builds context", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      stocktakeSession: { findMany: vi.fn().mockResolvedValue([]) }
    } as any;

    const result = await streamInventoryInsights({ shopId: "shop_1", prompt: "What should I fix?" }, db);

    expect(result).toBeDefined();
    expect(db.stocktakeSession.findMany).toHaveBeenCalled();
  });
});
