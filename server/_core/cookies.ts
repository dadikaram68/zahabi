import { randomBytes } from "node:crypto";
import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  if (!isSecureRequest(req)) {
    return {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    };
  }

  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
  };
}

export function getCsrfCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // CSRF token cookie must be accessible by JavaScript (readable by the
  // frontend to send as a header), so httpOnly is false. SameSite=strict
  // prevents the cookie from being sent on cross-origin requests, which is
  // the core CSRF defense.
  if (!isSecureRequest(req)) {
    return {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: false,
    };
  }

  return {
    httpOnly: false,
    path: "/",
    sameSite: "none",
    secure: true,
  };
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}
