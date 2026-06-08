import { describe, expect, it } from "vitest";
import { recommendPriceResponse } from "./competitorMonitor.service";

describe("competitorMonitor.service", () => {
  it("suggests defensive actions when competitor undercuts", () => {
    expect(recommendPriceResponse(100, 85)).toBe("Differentiate or bundle to defend margin");
    expect(recommendPriceResponse(100, 97)).toBe("Consider tactical reprice on top-selling SKU");
  });
});
