import { afterEach, describe, expect, it, vi } from "vitest";
import { createDraftLineId } from "./AccountingWorkspace";

describe("createDraftLineId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a non-empty fallback when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createDraftLineId()).toMatch(/^draft-/);
  });
});
