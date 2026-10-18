import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { hashInternalPassword, INTERNAL_SESSION_COOKIE } from "./internalAuth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("internal daily login integration", () => {
  it("creates a daily session cookie for an active internal user without returning the password hash", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الدخول الداخلي");
    const suffix = Date.now();
    const username = `login.${suffix}`;
    const passwordHash = await hashInternalPassword("A-strong-password-2026");
    const inserted = await database.insert(users).values({ openId: `internal-test-${suffix}`, name: "مستخدم دخول", loginMethod: "internal", username, passwordHash, isInternalUser: true, isActive: true, role: "user" });
    const userId = Number(inserted[0].insertId);
    const cookies: Array<{ name: string; value: string }> = [];
    try {
      const ctx: TrpcContext = { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { cookie: (name: string, value: string) => { cookies.push({ name, value }); } } as TrpcContext["res"] };
      const result = await appRouter.createCaller(ctx).auth.internalLogin({ username, password: "A-strong-password-2026" });
      expect(result).toMatchObject({ id: userId, username, passwordHash: undefined });
      expect(cookies.some(cookie => cookie.name === INTERNAL_SESSION_COOKIE && cookie.value.length > 20)).toBe(true);
    } finally {
      await database.delete(users).where(eq(users.id, userId));
    }
  });

  it("rejects a deactivated internal account before it can receive a session", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الدخول الداخلي");
    const suffix = Date.now();
    const username = `disabled.${suffix}`;
    const passwordHash = await hashInternalPassword("A-strong-password-2026");
    const inserted = await database.insert(users).values({ openId: `internal-disabled-${suffix}`, name: "حساب موقوف", loginMethod: "internal", username, passwordHash, isInternalUser: true, isActive: false, role: "user" });
    const userId = Number(inserted[0].insertId);
    const cookies: Array<{ name: string; value: string }> = [];
    try {
      const ctx: TrpcContext = { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { cookie: (name: string, value: string) => { cookies.push({ name, value }); } } as TrpcContext["res"] };
      await expect(appRouter.createCaller(ctx).auth.internalLogin({ username, password: "A-strong-password-2026" })).rejects.toThrow("اسم المستخدم أو كلمة المرور غير صحيحين");
      expect(cookies).toHaveLength(0);
    } finally {
      await database.delete(users).where(eq(users.id, userId));
    }
  });
});
