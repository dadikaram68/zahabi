import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { Request } from "express";

const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "aldhahabi_csrf_token";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * CSRF protection middleware for state-changing mutations.
 * Reads the CSRF token from the X-CSRF-Token header and compares it
 * (timing-safe) against the value in the aldhahabi_csrf_token cookie.
 * Skipped for idempotent queries.
 */
export const csrfMiddleware = t.middleware(async opts => {
  const { ctx, next, type } = opts;

  // Only enforce on mutations.
  if (type !== "mutation") {
    return next();
  }

  const req = ctx.req as unknown as Request;
  const cookieHeader = req.headers.cookie;
  const csrfCookie = cookieHeader
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(CSRF_COOKIE_NAME + "="))
    ?.slice(CSRF_COOKIE_NAME.length + 1);

  const csrfHeader = req.headers[CSRF_HEADER_NAME];

  const headerValue = Array.isArray(csrfHeader)
    ? csrfHeader[0]
    : csrfHeader;

  if (!csrfCookie || !headerValue) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF token missing",
    });
  }

  const cookieBuffer = Buffer.from(csrfCookie, "utf8");
  const headerBuffer = Buffer.from(headerValue, "utf8");

  // Constant-time comparison to prevent timing attacks.
  if (cookieBuffer.length !== headerBuffer.length) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid CSRF token",
    });
  }

  const crypto = await import("node:crypto");
  const equal = crypto.timingSafeEqual(cookieBuffer, headerBuffer);

  if (!equal) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid CSRF token",
    });
  }

  return next();
});

/** Protected procedure with CSRF enforcement for state-changing mutations. */
export const protectedCsrfProcedure = t.procedure
  .use(requireUser)
  .use(csrfMiddleware);

/** Public procedure with CSRF enforcement (for logout etc.). */
export const publicCsrfProcedure = t.procedure.use(csrfMiddleware);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

