import { describe, expect, it } from "vitest";
import { formatDateTime } from "./dateTime";

describe("formatDateTime", () => {
  it("renders a timestamp with date, hour, minute, and second", () => {
    expect(formatDateTime("2026-10-13T06:27:43.000Z", "ar")).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2} (صباحاً|مساءً)$/
    );
    expect(formatDateTime("2026-10-13T18:27:43.000Z", "en")).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{1,2}:\d{2}:\d{2} (AM|PM)$/
    );
  });

  it("returns a clear placeholder for missing or invalid values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});
