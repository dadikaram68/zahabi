import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions, getCsrfCookieOptions, generateCsrfToken } from "./_core/cookies";
import {
  INTERNAL_SESSION_COOKIE,
  beginTotpSetup,
  confirmTotpSetup,
  createInternalSession,
  createTotpChallenge,
  disableMfa,
  getInternalSessionDurationMs,
  getMfaStatus,
  listInternalSessions,
  loginInternalUser,
  revokeInternalSession,
  revokeInternalSessionById,
  verifyTotpChallenge,
} from "./internalAuth";
import { systemRouter } from "./_core/systemRouter";
import {
  protectedProcedure,
  publicProcedure,
  protectedCsrfProcedure,
  publicCsrfProcedure,
  router,
} from "./_core/trpc";
import { inventoryRouter } from "./routers/inventory";
import { commerceRouter } from "./routers/commerce";
import { backupsRouter } from "./routers/backups";
import { accountingRouter } from "./routers/accounting";

const CSRF_COOKIE_NAME = "aldhahabi_csrf_token";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? ({ ...opts.ctx.user, passwordHash: undefined }) : null),
    internalLogin: publicProcedure.input(z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(10).max(256) })).mutation(async ({ ctx, input }) => {
      const user = await loginInternalUser(input.username, input.password, ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString() ?? "");
      const csrfToken = generateCsrfToken();
      const csrfCookieOptions = getCsrfCookieOptions(ctx.req);
      ctx.res.cookie(CSRF_COOKIE_NAME, csrfToken, { ...csrfCookieOptions, maxAge: await getInternalSessionDurationMs(user.id) });
      if (user.mfaEnabled) {
        if (user.mfaMode !== "totp") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "التحقق عبر البريد غير مفعّل بعد؛ اختر Authenticator أو اربط مزود بريد الشركة أولاً" });
        return { requiresMfa: true as const, challengeToken: await createTotpChallenge(user.id), mode: "totp" as const, csrfToken };
      }
      const token = await createInternalSession(user.id, { ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(), userAgent: ctx.req.headers["user-agent"] });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...cookieOptions, maxAge: await getInternalSessionDurationMs(user.id) });
      return { ...user, passwordHash: undefined, csrfToken };
    }),
    verifyMfa: publicProcedure.input(z.object({ challengeToken: z.string().min(32).max(128), code: z.string().regex(/^\d{6}$/) })).mutation(async ({ ctx, input }) => {
      const userId = await verifyTotpChallenge(input.challengeToken, input.code);
      const csrfToken = generateCsrfToken();
      const csrfCookieOptions = getCsrfCookieOptions(ctx.req);
      ctx.res.cookie(CSRF_COOKIE_NAME, csrfToken, { ...csrfCookieOptions, maxAge: await getInternalSessionDurationMs(userId) });
      const token = await createInternalSession(userId, { ipAddress: ctx.req.ip ?? ctx.req.headers["x-forwarded-for"]?.toString(), userAgent: ctx.req.headers["user-agent"] });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...cookieOptions, maxAge: await getInternalSessionDurationMs(userId) });
      return { success: true as const, csrfToken };
    }),
    mfaStatus: protectedProcedure.query(({ ctx }) => getMfaStatus(ctx.user.id)),
    beginMfaSetup: protectedCsrfProcedure.mutation(({ ctx }) => beginTotpSetup(ctx.user.id)),
    confirmMfaSetup: protectedCsrfProcedure.input(z.object({ code: z.string().regex(/^\d{6}$/) })).mutation(({ ctx, input }) => confirmTotpSetup(ctx.user.id, input.code)),
    disableMfa: protectedCsrfProcedure.mutation(({ ctx }) => disableMfa(ctx.user.id)),
    sessions: protectedProcedure.query(({ ctx }) => listInternalSessions(ctx.user.id)),
    revokeSession: protectedCsrfProcedure.input(z.object({ sessionId: z.coerce.number().int().positive() })).mutation(({ ctx, input }) => revokeInternalSessionById(ctx.user.id, input.sessionId)),
    logout: publicCsrfProcedure.mutation(async ({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      const csrfCookieOptions = getCsrfCookieOptions(ctx.req);
      const token = ctx.req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(INTERNAL_SESSION_COOKIE + "="))?.slice(INTERNAL_SESSION_COOKIE.length + 1);
      if (token) await revokeInternalSession(token);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(INTERNAL_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
      ctx.res.clearCookie(CSRF_COOKIE_NAME, { ...csrfCookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  inventory: inventoryRouter,
  commerce: commerceRouter,
  backups: backupsRouter,
  accounting: accountingRouter,
});
