import { describe, expect, it } from "vitest";
import { classifyLocationAbc } from "./multiLocation.service";

describe("multiLocation.service", () => {
  it("classifies location-level ABC", () => {
    expect(classifyLocationAbc(0.8)).toBe("A");
    expect(classifyLocationAbc(0.85)).toBe("A");
    expect(classifyLocationAbc(0.5)).toBe("B");
    expect(classifyLocationAbc(0.6)).toBe("B");
    expect(classifyLocationAbc(0.49)).toBe("C");
    expect(classifyLocationAbc(0.2)).toBe("C");
  });
});
