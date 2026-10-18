import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { and, desc, eq, gte, isNull, lt, count } from "drizzle-orm";
import {
  accountingInternalLoginAttempts,
  accountingInternalSecuritySettings,
  accountingInternalSessions,
  accountingMfaChallenges,
  accountingRoles,
  accountingUserRoles,
  users,
  type User,
} from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

const scrypt = promisify(scryptCallback);
export const INTERNAL_SESSION_COOKIE = "aldhahabi_internal_session";
const INTERNAL_SESSION_MS = 24 * 60 * 60 * 1000;

export async function getInternalSessionDurationMs(userId: number) {
  const db = await getDb();
  if (!db) return INTERNAL_SESSION_MS;
  const [setting] = await db
    .select({
      minutes: accountingInternalSecuritySettings.sessionDurationMinutes,
    })
    .from(accountingInternalSecuritySettings)
    .innerJoin(
      accountingRoles,
      eq(
        accountingInternalSecuritySettings.companyId,
        accountingRoles.companyId
      )
    )
    .innerJoin(
      accountingUserRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingUserRoles.userId, userId))
    .limit(1);
  const minutes = Math.min(
    7 * 24 * 60,
    Math.max(15, Number(setting?.minutes ?? 1440))
  );
  return minutes * 60 * 1000;
}

export async function getInternalSecuritySettings(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [row] = await db
    .select({ companyId: accountingRoles.companyId })
    .from(accountingUserRoles)
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingUserRoles.userId, userId))
    .limit(1);
  if (!row) return { sessionDurationMinutes: 1440, maxFailedAttempts: 5 };
  const [setting] = await db
    .select({
      sessionDurationMinutes:
        accountingInternalSecuritySettings.sessionDurationMinutes,
      maxFailedAttempts: accountingInternalSecuritySettings.maxFailedAttempts,
    })
    .from(accountingInternalSecuritySettings)
    .where(eq(accountingInternalSecuritySettings.companyId, row.companyId))
    .limit(1);
  return {
    sessionDurationMinutes: setting?.sessionDurationMinutes ?? 1440,
    maxFailedAttempts: setting?.maxFailedAttempts ?? 5,
  };
}

export async function updateInternalSecuritySettings(
  userId: number,
  input: { sessionDurationMinutes: number; maxFailedAttempts: number }
) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [row] = await db
    .select({ companyId: accountingRoles.companyId })
    .from(accountingUserRoles)
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingUserRoles.userId, userId))
    .limit(1);
  if (!row) throw new Error("لا توجد شركة مرتبطة بالمستخدم");
  const values = {
    companyId: row.companyId,
    sessionDurationMinutes: Math.min(
      10080,
      Math.max(15, Math.round(input.sessionDurationMinutes))
    ),
    maxFailedAttempts: Math.min(
      20,
      Math.max(3, Math.round(input.maxFailedAttempts))
    ),
    updatedBy: userId,
  };
  const [existing] = await db
    .select({ id: accountingInternalSecuritySettings.id })
    .from(accountingInternalSecuritySettings)
    .where(eq(accountingInternalSecuritySettings.companyId, row.companyId))
    .limit(1);
  if (existing)
    await db
      .update(accountingInternalSecuritySettings)
      .set(values)
      .where(eq(accountingInternalSecuritySettings.id, existing.id));
  else await db.insert(accountingInternalSecuritySettings).values(values);
  return getInternalSecuritySettings(userId);
}

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const MFA_PBKDF2_ITERATIONS = 100000;
const MFA_PBKDF2_KEYLEN = 32;

function mfaEncryptionKey(password: string, salt: Buffer) {
  const derived = promisify(pbkdf2)(
    password,
    salt,
    MFA_PBKDF2_ITERATIONS,
    MFA_PBKDF2_KEYLEN,
    "sha256"
  );
  return derived as Promise<Buffer>;
}

function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const salt = randomBytes(16);
  const key = mfaEncryptionKey(ENV.cookieSecret, salt);
  const cipher = createCipheriv("aes-256-gcm", key as Buffer, iv);
  const encrypted = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return `${salt.toString("hex")}.${iv.toString("hex")}.${cipher.getAuthTag().toString("hex")}.${encrypted.toString("hex")}`;
}

function decryptMfaSecret(value: string) {
  const [saltHex, ivHex, tagHex, encryptedHex] = value.split(".");
  if (!saltHex || !ivHex || !tagHex || !encryptedHex)
    throw new Error("سر MFA غير صالح");
  const key = mfaEncryptionKey(ENV.cookieSecret, Buffer.from(saltHex, "hex"));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key as Buffer,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(bytes: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index] ?? 0;
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string) {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of value.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("سر MFA غير صالح");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}
export function generateTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0"
  );
}
export function verifyTotpCode(
  secret: string,
  code: string,
  timestamp = Date.now()
) {
  return [-1, 0, 1].some(
    offset =>
      generateTotpCode(secret, timestamp + offset * 30000) === code.trim()
  );
}

export function mfaSecretForStorage(secret: string) {
  return encryptMfaSecret(secret);
}
function mfaSecretFromStorage(value: string) {
  return decryptMfaSecret(value);
}

function secretKey() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  return raw
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function assertInternalPasswordPolicy(password: string) {
  if (password.length < 10)
    throw new Error("كلمة المرور يجب أن تحتوي على 10 محارف على الأقل");
  if (password.length > 128)
    throw new Error("كلمة المرور طويلة جدًا (الحد الأقصى 128 محرفًا)");
  if (
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    /[^A-Za-z0-9]/.test(password) === false
  ) {
    throw new Error(
      "كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم ورمز خاص واحد على الأقل"
    );
  }
  return true;
}

export async function hashInternalPassword(password: string) {
  assertInternalPasswordPolicy(password);
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyInternalPassword(
  password: string,
  storedHash: string
) {
  const [algorithm, salt, expectedHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createInternalSession(
  userId: number,
  metadata?: { ipAddress?: string; userAgent?: string }
) {
  const sessionMs = await getInternalSessionDurationMs(userId);
  const token = await new SignJWT({
    internalUserId: String(userId),
    kind: "internal",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + sessionMs) / 1000))
    .sign(secretKey());
  const db = await getDb();
  if (db)
    await db.insert(accountingInternalSessions).values({
      userId,
      tokenHash: sessionHash(token),
      expiresAt: new Date(Date.now() + sessionMs),
      ipAddress: metadata?.ipAddress?.slice(0, 64),
      userAgent: metadata?.userAgent?.slice(0, 512),
    });
  return token;
}

export async function authenticateInternalRequest(
  req: Request
): Promise<User | null> {
  const token = readCookie(req, INTERNAL_SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (
      payload.kind !== "internal" ||
      typeof payload.internalUserId !== "string" ||
      !/^\d+$/.test(payload.internalUserId)
    )
      return null;
    const db = await getDb();
    if (!db) return null;
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, Number(payload.internalUserId)),
          eq(users.isInternalUser, true),
          eq(users.isActive, true)
        )
      )
      .limit(1);
    if (!user) return null;
    const [session] = await db
      .select({ id: accountingInternalSessions.id })
      .from(accountingInternalSessions)
      .where(
        and(
          eq(accountingInternalSessions.userId, user.id),
          eq(accountingInternalSessions.tokenHash, sessionHash(token)),
          isNull(accountingInternalSessions.revokedAt),
          gte(accountingInternalSessions.expiresAt, new Date())
        )
      )
      .limit(1);
    return session ? user : null;
  } catch {
    return null;
  }
}

export async function revokeInternalSession(token: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(accountingInternalSessions)
    .set({ revokedAt: new Date() })
    .where(eq(accountingInternalSessions.tokenHash, sessionHash(token)));
}

export async function listInternalSessions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db
    .select({
      id: accountingInternalSessions.id,
      ipAddress: accountingInternalSessions.ipAddress,
      userAgent: accountingInternalSessions.userAgent,
      expiresAt: accountingInternalSessions.expiresAt,
      revokedAt: accountingInternalSessions.revokedAt,
      createdAt: accountingInternalSessions.createdAt,
    })
    .from(accountingInternalSessions)
    .where(
      and(
        eq(accountingInternalSessions.userId, userId),
        gte(accountingInternalSessions.expiresAt, new Date())
      )
    )
    .orderBy(desc(accountingInternalSessions.createdAt))
    .limit(50);
}

export async function revokeInternalSessionById(
  userId: number,
  sessionId: number
) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  await db
    .update(accountingInternalSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountingInternalSessions.id, sessionId),
        eq(accountingInternalSessions.userId, userId),
        isNull(accountingInternalSessions.revokedAt)
      )
    );
  return { success: true as const };
}

export async function getMfaStatus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [user] = await db
    .select({
      mfaEnabled: users.mfaEnabled,
      mfaMode: users.mfaMode,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    enabled: Boolean(user?.mfaEnabled),
    mode: user?.mfaMode ?? "totp",
    emailConfigured: Boolean(user?.email),
  };
}

export async function beginTotpSetup(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [user] = await db
    .select({ username: users.username, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("المستخدم غير موجود");
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({
      mfaSecretEncrypted: mfaSecretForStorage(secret),
      mfaEnabled: false,
      mfaMode: "totp",
    })
    .where(eq(users.id, userId));
  const label = encodeURIComponent(
    user.username ?? user.email ?? `user-${userId}`
  );
  return {
    secret,
    provisioningUri: `otpauth://totp/Aldhahabi:${label}?secret=${secret}&issuer=Aldhahabi&algorithm=SHA1&digits=6&period=30`,
  };
}

export async function confirmTotpSetup(userId: number, code: string) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [user] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (
    !user?.mfaSecretEncrypted ||
    !verifyTotpCode(mfaSecretFromStorage(user.mfaSecretEncrypted), code)
  )
    throw new Error("رمز Authenticator غير صحيح");
  await db
    .update(users)
    .set({ mfaEnabled: true, mfaMode: "totp" })
    .where(eq(users.id, userId));
  return { enabled: true as const, mode: "totp" as const };
}

export async function disableMfa(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  await db
    .update(users)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null })
    .where(eq(users.id, userId));
  await db
    .update(accountingInternalSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountingInternalSessions.userId, userId),
        isNull(accountingInternalSessions.revokedAt)
      )
    );
  return { enabled: false as const };
}

const MFA_CHALLENGE_WINDOW_MS = 15 * 60 * 1000;
const MFA_MAX_CHALLENGES_PER_WINDOW = 5;

export async function createTotpChallenge(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  // Rate limit MFA challenge creation per user.
  const cutoff = new Date(Date.now() - MFA_CHALLENGE_WINDOW_MS);
  const [{ count: challengeCount }] = await db
    .select({ count: count() })
    .from(accountingMfaChallenges)
    .where(
      and(
        eq(accountingMfaChallenges.userId, userId),
        gte(accountingMfaChallenges.createdAt, cutoff)
      )
    );
  if (Number(challengeCount) >= MFA_MAX_CHALLENGES_PER_WINDOW)
    throw new Error(
      "تم تجاوز عدد محاولات التحقق؛ أعد المحاولة بعد 15 دقيقة"
    );
  const token = randomBytes(32).toString("hex");
  await db.insert(accountingMfaChallenges).values({
    userId,
    mode: "totp",
    challengeTokenHash: sessionHash(token),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  return token;
}

export async function verifyTotpChallenge(
  challengeToken: string,
  code: string
) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [challenge] = await db
    .select()
    .from(accountingMfaChallenges)
    .where(
      and(
        eq(
          accountingMfaChallenges.challengeTokenHash,
          sessionHash(challengeToken)
        ),
        isNull(accountingMfaChallenges.consumedAt),
        gte(accountingMfaChallenges.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!challenge) throw new Error("انتهت صلاحية جلسة التحقق؛ أعد تسجيل الدخول");
  const [user] = await db
    .select({ mfaSecretEncrypted: users.mfaSecretEncrypted })
    .from(users)
    .where(
      and(
        eq(users.id, challenge.userId),
        eq(users.isInternalUser, true),
        eq(users.isActive, true)
      )
    )
    .limit(1);
  if (
    !user?.mfaSecretEncrypted ||
    !verifyTotpCode(mfaSecretFromStorage(user.mfaSecretEncrypted), code)
  )
    throw new Error("رمز Authenticator غير صحيح");
  await db
    .update(accountingMfaChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(accountingMfaChallenges.id, challenge.id));
  return challenge.userId;
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED_ATTEMPTS = 5;

// In-memory fallback for when the database is unavailable (e.g. tests, local dev).
const fallbackLoginFailures = new Map<string, number[]>();

function fallbackLoginKey(username: string, ip: string) {
  return `${normalizeUsername(username)}|${ip}`;
}

export async function registerFailedLoginAttempt(
  username: string,
  ip: string
) {
  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);
  if (db) {
    await db.insert(accountingInternalLoginAttempts).values({
      username: normalizedUsername,
      ipAddress: ip.slice(0, 64),
    });
    // Prune old attempts to bound table growth.
    const cutoff = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MS);
    await db
      .delete(accountingInternalLoginAttempts)
      .where(lt(accountingInternalLoginAttempts.attemptedAt, cutoff));
  } else {
    const key = fallbackLoginKey(normalizedUsername, ip);
    const now = Date.now();
    const recent = (fallbackLoginFailures.get(key) ?? []).filter(
      timestamp => now - timestamp < LOGIN_FAILURE_WINDOW_MS
    );
    recent.push(now);
    fallbackLoginFailures.set(key, recent);
  }
}

export async function assertLoginNotLocked(username: string, ip: string) {
  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);
  if (db) {
    const cutoff = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MS);
    const [{ count: failedCount }] = await db
      .select({ count: count() })
      .from(accountingInternalLoginAttempts)
      .where(
        and(
          eq(accountingInternalLoginAttempts.username, normalizedUsername),
          gte(accountingInternalLoginAttempts.attemptedAt, cutoff)
        )
      );
    if (Number(failedCount) >= LOGIN_MAX_FAILED_ATTEMPTS)
      throw new Error(
        "تم تجاوز عدد محاولات الدخول؛ أعد المحاولة بعد 15 دقيقة"
      );
  } else {
    const key = fallbackLoginKey(normalizedUsername, ip);
    const now = Date.now();
    const recent = (fallbackLoginFailures.get(key) ?? []).filter(
      timestamp => now - timestamp < LOGIN_FAILURE_WINDOW_MS
    );
    if (recent.length >= LOGIN_MAX_FAILED_ATTEMPTS)
      throw new Error(
        "تم تجاوز عدد محاولات الدخول؛ أعد المحاولة بعد 15 دقيقة"
      );
  }
}

export async function clearFailedLoginAttempts(username: string, ip: string) {
  const db = await getDb();
  const normalizedUsername = normalizeUsername(username);
  if (db) {
    await db
      .delete(accountingInternalLoginAttempts)
      .where(
        and(
          eq(accountingInternalLoginAttempts.username, normalizedUsername),
          eq(accountingInternalLoginAttempts.ipAddress, ip.slice(0, 64))
        )
      );
  } else {
    fallbackLoginFailures.delete(fallbackLoginKey(normalizedUsername, ip));
  }
}

export async function loginInternalUser(
  username: string,
  password: string,
  ipAddress = ""
) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  await assertLoginNotLocked(username, ipAddress);
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.username, normalizeUsername(username)),
        eq(users.isInternalUser, true),
        eq(users.isActive, true)
      )
    )
    .limit(1);
  if (
    !user?.passwordHash ||
    !(await verifyInternalPassword(password, user.passwordHash))
  ) {
    await registerFailedLoginAttempt(username, ipAddress);
    throw new Error("اسم المستخدم أو كلمة المرور غير صحيحين");
  }
  await clearFailedLoginAttempts(username, ipAddress);
  // Session fixation protection: revoke all existing sessions for this user
  // before creating a new one, so old session tokens cannot be reused.
  await db
    .update(accountingInternalSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountingInternalSessions.userId, user.id),
        isNull(accountingInternalSessions.revokedAt)
      )
    );
  await db
    .update(users)
    .set({ lastInternalSignedIn: new Date(), lastSignedIn: new Date() })
    .where(eq(users.id, user.id));
  return user;
}
