import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import { INTERNAL_SESSION_COOKIE } from "./internalAuth";

const CSRF_COOKIE_NAME = "aldhahabi_csrf_token";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    username: null,
    passwordHash: null,
    isInternalUser: false,
    isActive: true,
    lastInternalSignedIn: null,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {
        cookie: "aldhahabi_csrf_token=test-csrf-token-12345",
        "x-csrf-token": "test-csrf-token-12345",
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(3);
    const cookieNames = clearedCookies.map(c => c.name).sort();
    expect(cookieNames).toEqual([COOKIE_NAME, CSRF_COOKIE_NAME, INTERNAL_SESSION_COOKIE].sort());
    const sessionCookie = clearedCookies.find(c => c.name === INTERNAL_SESSION_COOKIE);
    expect(sessionCookie?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
