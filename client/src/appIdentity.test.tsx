import { describe, expect, it } from "vitest";
import { DEFAULT_APPLICATION_TITLE, getApplicationTitle } from "./appIdentity";

describe("application title configuration", () => {
  it("uses the configured published application title and safely falls back to the approved title", () => {
    expect(getApplicationTitle("الذهبي للمحاسبة")).toBe("الذهبي للمحاسبة");
    expect(getApplicationTitle(" ")).toBe(DEFAULT_APPLICATION_TITLE);
  });
});
