import { describe, expect, it, vi } from "vitest";
import {
  getPlatformInfrastructureDashboard,
  pinAIInsight,
  rememberAIContext,
  suggestCrossStoreTransfers,
  upsertManagedStore,
  upsertWhiteLabelProfile
} from "./platformInfrastructure.service";

describe("platformInfrastructure.service", () => {
  it("upserts agency white-label settings with branded notification defaults", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      whiteLabelProfile: { upsert: vi.fn().mockResolvedValue({ id: "wl_1", status: "ACTIVE" }) }
    } as any;

    await upsertWhiteLabelProfile(
      {
        shopId: "shop_1",
        agencyName: "Northstar Agency",
        brandName: "Northstar Inventory",
        supportEmail: "support@northstar.example"
      },
      db
    );

    expect(db.whiteLabelProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          brandName: "Northstar Inventory",
          emailFromName: "Northstar Inventory",
          status: "ACTIVE"
        })
      })
    );
  });

  it("upserts connected managed stores for one-login multi-store management", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      managedStore: { upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ id: "store_1", ...create })) }
    } as any;

    const store = await upsertManagedStore(
      {
        shopId: "shop_1",
        shopifyDomain: "outlet.myshopify.com",
        name: "Outlet Store",
        inventoryEfficiencyScore: 83,
        revenue30d: 12000,
        inventoryValue: 9000,
        unitsOnHand: 310
      },
      db
    );

    expect(store.status).toBe("CONNECTED");
    expect(db.managedStore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId_shopifyDomain: { shopId: "shop_1", shopifyDomain: "outlet.myshopify.com" } } })
    );
  });

  it("suggests a cross-store transfer from the highest inventory value store to the lowest units store", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      managedStore: {
        findMany: vi.fn().mockResolvedValue([
          { id: "store_a", name: "Main Store", inventoryValue: 25000, unitsOnHand: 900, inventoryEfficiencyScore: 58 },
          { id: "store_b", name: "Outlet Store", inventoryValue: 6000, unitsOnHand: 80, inventoryEfficiencyScore: 88 }
        ])
      },
      crossStoreTransferSuggestion: {
        create: vi.fn().mockResolvedValue({ id: "transfer_1", sku: "MULTI-STORE-MIX" })
      }
    } as any;

    const suggestions = await suggestCrossStoreTransfers("shop_1", db);

    expect(suggestions).toHaveLength(1);
    expect(db.crossStoreTransferSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStoreId: "store_a",
          toStoreId: "store_b"
        })
      })
    );
  });

  it("remembers repeated AI topics and raises importance", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      aIMemoryEvent: {
        findUnique: vi.fn().mockResolvedValue({ queryCount: 3, summary: "Prior supplier concern" }),
        upsert: vi.fn().mockImplementation(({ update }) => Promise.resolve({ id: "mem_1", ...update }))
      }
    } as any;

    const memory = await rememberAIContext({ shopId: "shop_1", question: "Who is my most unreliable supplier?" }, db);

    expect(memory.queryCount).toBe(4);
    expect(Number(memory.importance)).toBeGreaterThan(70);
    expect(db.aIMemoryEvent.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { shopId_topic: { shopId: "shop_1", topic: "supplier reliability" } } }));
  });

  it("pins AI insights for team reference", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      aIPinnedInsight: { create: vi.fn().mockResolvedValue({ id: "pin_1", title: "Watch Threadhouse" }) }
    } as any;

    await pinAIInsight(
      {
        shopId: "shop_1",
        title: "Watch Threadhouse",
        insight: "Supplier score dropped below 60.",
        confidence: "High",
        tags: ["supplier", "risk"]
      },
      db
    );

    expect(db.aIPinnedInsight.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: ["supplier", "risk"], confidence: "High" }) })
    );
  });

  it("summarizes infrastructure dashboard metrics", async () => {
    const db = {
      feature: { findUnique: vi.fn().mockResolvedValue({ status: "ENABLED" }) },
      whiteLabelProfile: { findUnique: vi.fn().mockResolvedValue({ status: "ACTIVE" }) },
      managedStore: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Main Store", inventoryEfficiencyScore: 91, inventoryValue: 10000, revenue30d: 18000 },
          { name: "Outlet Store", inventoryEfficiencyScore: 72, inventoryValue: 4000, revenue30d: 7000 }
        ])
      },
      crossStoreTransferSuggestion: { findMany: vi.fn().mockResolvedValue([]) },
      aIMemoryEvent: { findMany: vi.fn().mockResolvedValue([{ id: "mem_1" }]) },
      aIPinnedInsight: { findMany: vi.fn().mockResolvedValue([{ id: "pin_1" }, { id: "pin_2" }]) }
    } as any;

    const dashboard = await getPlatformInfrastructureDashboard("shop_1", db);

    expect(dashboard.metrics.whiteLabelActive).toBe(true);
    expect(dashboard.metrics.storeCount).toBe(2);
    expect(dashboard.metrics.totalInventoryValue).toBe(14000);
    expect(dashboard.metrics.pinnedInsights).toBe(2);
  });
});
