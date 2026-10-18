import { describe, expect, it } from "vitest";
import {
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from "./internalAuth";

describe("internal MFA TOTP", () => {
  it("generates a valid base32 secret", () => {
    const secret = generateTotpSecret();
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    expect(secret.length).toBeGreaterThan(0);
  });

  it("generates a six-digit code accepted within the clock-skew window", () => {
    const secret = generateTotpSecret();
    const now = 1_735_689_600_000;
    const code = generateTotpCode(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
    // One step before and after is accepted (clock skew).
    expect(verifyTotpCode(secret, code, now - 30_000)).toBe(true);
    expect(verifyTotpCode(secret, code, now + 30_000)).toBe(true);
    // Two steps away is rejected.
    expect(verifyTotpCode(secret, code, now + 60_000)).toBe(false);
    expect(verifyTotpCode(secret, code, now - 60_000)).toBe(false);
  });

  it("rejects a malformed or incorrect code", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000", 1_735_689_600_000)).toBe(false);
    expect(verifyTotpCode(secret, "12345", 1_735_689_600_000)).toBe(false);
    expect(() => generateTotpCode("not-a-secret", Date.now())).toThrow();
  });

  it("produces different codes for different secrets at the same time", () => {
    const now = Date.now();
    const codeA = generateTotpCode(generateTotpSecret(), now);
    const codeB = generateTotpCode(generateTotpSecret(), now);
    expect(codeA).not.toBe(codeB);
  });

  it("rejects codes with surrounding whitespace only when they still match after trim", () => {
    const secret = generateTotpSecret();
    const now = 1_735_689_600_000;
    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, ` ${code} `, now)).toBe(true);
  });
});
