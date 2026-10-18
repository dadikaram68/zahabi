import { describe, expect, it } from "vitest";
import { getMovementResult, isLowStock } from "./inventoryRules";

describe("inventory threshold rules", () => {
  it("marks stock red only when it is below the configured threshold", () => {
    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(false);
    expect(isLowStock(8, 5)).toBe(false);
  });
});

describe("inventory movement rules", () => {
  it("updates quantity for valid incoming and outgoing movements", () => {
    expect(getMovementResult(8, "in", 6)).toBe(14);
    expect(getMovementResult(8, "out", 3)).toBe(5);
  });

  it("rejects outgoing movements that exceed available quantity", () => {
    expect(() => getMovementResult(2, "out", 3)).toThrow("الكمية المتاحة لا تكفي");
  });

  it("rejects non-positive movement quantities", () => {
    expect(() => getMovementResult(2, "in", 0)).toThrow("كمية الحركة");
    expect(() => getMovementResult(2, "out", -1)).toThrow("كمية الحركة");
  });
});
