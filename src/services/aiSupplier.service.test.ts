import { describe, expect, it, vi } from "vitest";
import { getReplacementSupplierSuggestions, streamSupplierEmailDraft } from "./aiSupplier.service";

vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "claude-model") }));
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => "openai-model") }));
vi.mock("ai", () => ({ streamText: vi.fn(() => ({ toDataStreamResponse: vi.fn() })) }));

describe("aiSupplier.service", () => {
  it("streams AI-drafted supplier emails", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      supplier: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "supplier_1", name: "Northline", purchaseOrders: [] })
      }
    } as any;

    const result = await streamSupplierEmailDraft(
      { shopId: "shop_1", supplierId: "supplier_1", intent: "DELAY_INQUIRY" },
      db
    );

    expect(result).toBeDefined();
  });

  it("flags when a replacement supplier search is needed", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      supplier: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: "supplier_1",
          reliabilityScore: 52,
          leadTimes: [{ category: "Apparel" }]
        }),
        findMany: vi.fn().mockResolvedValue([])
      }
    } as any;

    const result = await getReplacementSupplierSuggestions("shop_1", "supplier_1", db);
    expect(result.needsNewSupplierSearch).toBe(true);
  });
});
