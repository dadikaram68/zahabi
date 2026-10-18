import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(async () => null),
}));
vi.mock("./db", () => mocks);

import {
  assertInternalPasswordPolicy,
  assertLoginNotLocked,
  clearFailedLoginAttempts,
  createInternalSession,
  hashInternalPassword,
  normalizeUsername,
  registerFailedLoginAttempt,
  verifyInternalPassword,
} from "./internalAuth";

describe("internal password policy", () => {
  it("accepts a password meeting length and complexity rules", () => {
    expect(assertInternalPasswordPolicy("A-strong-password-2026")).toBe(true);
  });

  it("rejects a password shorter than 10 characters", () => {
    expect(() => assertInternalPasswordPolicy("Abc12345!")).toThrow(
      "كلمة المرور يجب أن تحتوي على 10 محارف على الأقل"
    );
  });

  it("rejects a password without an uppercase letter", () => {
    expect(() => assertInternalPasswordPolicy("abcdefghij1")).toThrow(
      "كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم"
    );
  });

  it("rejects a password without a lowercase letter", () => {
    expect(() => assertInternalPasswordPolicy("ABCDEFGHIJ1")).toThrow(
      "كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم"
    );
  });

  it("rejects a password without a digit", () => {
    expect(() => assertInternalPasswordPolicy("Abcdefghij")).toThrow(
      "كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم"
    );
  });
});

describe("username normalization", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeUsername("  Accountant.01  ")).toBe("accountant.01");
  });

  it("lowercases the username", () => {
    expect(normalizeUsername("ACCOUNTANT")).toBe("accountant");
  });

  it("normalizes mixed case and whitespace", () => {
    expect(normalizeUsername("  AccOUNTANT.01  ")).toBe("accountant.01");
  });
});


describe("password hashing and verification", () => {
  it("produces an scrypt hash and verifies the matching password", async () => {
    const hash = await hashInternalPassword("A-strong-password-2026");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$").length).toBe(3);
    await expect(
      verifyInternalPassword("A-strong-password-2026", hash)
    ).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashInternalPassword("A-strong-password-2026");
    await expect(verifyInternalPassword("wrong-password", hash)).resolves.toBe(
      false
    );
  });

  it("rejects a malformed stored hash", async () => {
    await expect(verifyInternalPassword("anything", "not-a-hash")).resolves.toBe(
      false
    );
    await expect(verifyInternalPassword("anything", "scrypt$")).resolves.toBe(
      false
    );
    await expect(
      verifyInternalPassword("anything", "sha256$salt$hex")
    ).resolves.toBe(false);
  });
});

describe("brute-force login protection", () => {
  const username = "login.user";
  const ip = "192.168.1.1";

  beforeEach(async () => {
    await clearFailedLoginAttempts(username, ip);
  });

  afterEach(async () => {
    await clearFailedLoginAttempts(username, ip);
  });

  it("allows login attempts below the failure threshold", async () => {
    for (let i = 0; i < 4; i += 1) {
      await registerFailedLoginAttempt(username, ip);
      await assertLoginNotLocked(username, ip);
    }
  });

  it("locks the username+IP pair after the maximum failed attempts", async () => {
    for (let i = 0; i < 5; i += 1) {
      await registerFailedLoginAttempt(username, ip);
    }
    await expect(assertLoginNotLocked(username, ip)).rejects.toThrow(
      "تم تجاوز عدد محاولات الدخول"
    );
  });

  it("tracks failures separately per username and IP", async () => {
    for (let i = 0; i < 5; i += 1) {
      await registerFailedLoginAttempt(username, ip);
    }
    await expect(assertLoginNotLocked(username, ip)).rejects.toThrow();
    await assertLoginNotLocked(username, "10.0.0.2");
    await assertLoginNotLocked("other.user", ip);
  });

  it("clears failures after a successful login", async () => {
    for (let i = 0; i < 5; i += 1) {
      await registerFailedLoginAttempt(username, ip);
    }
    await expect(assertLoginNotLocked(username, ip)).rejects.toThrow();
    await clearFailedLoginAttempts(username, ip);
    await assertLoginNotLocked(username, ip);
  });

  it("expires failures outside the 15-minute window", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      vi.setSystemTime(now);
      for (let i = 0; i < 5; i += 1) {
        await registerFailedLoginAttempt(username, ip);
      }
      await expect(assertLoginNotLocked(username, ip)).rejects.toThrow();

      vi.setSystemTime(now + 16 * 60 * 60 * 1000);
      await assertLoginNotLocked(username, ip);
    } finally {
      vi.useRealTimers();
      await clearFailedLoginAttempts(username, ip);
    }
  });

  it("bounds memory by pruning fully expired entries", async () => {
    const base = Date.now() - 20 * 60 * 60 * 1000;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(base);
      for (let i = 0; i < 6000; i += 1) {
        await registerFailedLoginAttempt(`user.${i}`, "10.0.0.1");
      }
      vi.setSystemTime(base + 20 * 60 * 60 * 1000);
      await registerFailedLoginAttempt("fresh.user", "10.0.0.1");
      await assertLoginNotLocked("fresh.user", "10.0.0.1");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("internal session JWT", () => {
  it("creates a signed HS256 JWT containing the internal user id", async () => {
    mocks.getDb.mockResolvedValue(null);
    const token = await createInternalSession(42, {
      ipAddress: "192.168.1.1",
      userAgent: "test-agent",
    });
    expect(typeof token).toBe("string");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    expect(payload.internalUserId).toBe("42");
    expect(payload.kind).toBe("internal");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

