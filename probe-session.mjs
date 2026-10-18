import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
const base = "http://localhost:3000";
const loginRes = await fetch(`${base}/api/trpc/auth.internalLogin?batch=1`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ "0": { json: { username: "admin", password: "Admin12345!" } } }),
});
const setCookies = loginRes.headers.getSetCookie?.() ?? [];
const token = setCookies.map(c => c.split(";")[0]).find(c => c.startsWith("aldhahabi_internal_session=")).split("=").slice(1).join("=");
const h = createHash("sha256").update(token).digest("hex");
const conn = await mysql.createConnection({ host: "127.0.0.1", port: 3308, user: "root", database: "aldhahabi" });
const [cols] = await conn.query("SHOW FULL COLUMNS FROM accounting_internal_sessions WHERE Field IN ('tokenHash','revokedAt','expiresAt')");
console.log(JSON.stringify(cols, null, 1));
const [byHash] = await conn.query("SELECT id, userId, revokedAt, expiresAt FROM accounting_internal_sessions WHERE tokenHash = ?", [h]);
console.log("byHash:", JSON.stringify(byHash));
await conn.end();
