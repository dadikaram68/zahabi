import { hashInternalPassword, normalizeUsername, verifyInternalPassword } from "./server/internalAuth";
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL || "mysql://root@127.0.0.1:3308/aldhahabi";
const username = normalizeUsername("admin");
const password = "Admin12345!";

const url = new URL(DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
});

const hash = await hashInternalPassword(password);
console.log("hash generated:", hash.slice(0, 20) + "...");

const [existing]: any = await conn.query("SELECT id, username, role, isInternalUser, isActive FROM users WHERE username = ?", [username]);
console.log("existing:", existing);

if (existing.length > 0) {
  await conn.query(
    "UPDATE users SET passwordHash = ?, isInternalUser = TRUE, isActive = TRUE, role = 'admin', loginMethod = 'internal', openId = ? WHERE username = ?",
    [hash, `internal-${username}`, username]
  );
  console.log(`Updated existing user '${username}' to admin with new password`);
} else {
  await conn.query(
    "INSERT INTO users (openId, name, username, passwordHash, isInternalUser, isActive, loginMethod, role) VALUES (?, ?, ?, ?, TRUE, TRUE, 'internal', 'admin')",
    [`internal-${username}`, "Administrator", username, hash]
  );
  console.log(`Created admin user '${username}'`);
}

const [check]: any = await conn.query("SELECT id, username, role, isInternalUser, isActive, loginMethod FROM users WHERE username = ?", [username]);
console.log("final:", check);

// verify password works
const [row]: any = await conn.query("SELECT passwordHash FROM users WHERE username = ?", [username]);
const ok = await verifyInternalPassword(password, row[0].passwordHash);
console.log("password verification:", ok ? "OK" : "FAIL");

await conn.end();
if (!ok) process.exit(1);
