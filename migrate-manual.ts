import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL || "mysql://root@127.0.0.1:3308/aldhahabi";
const DRIZZLE_DIR = path.resolve(process.cwd(), "drizzle");

// mysql2 connection from URL
const url = new URL(DATABASE_URL);
const conn = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  multipleStatements: false,
});

await conn.query(`CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
  \`id\` SERIAL PRIMARY KEY,
  \`hash\` text NOT NULL,
  \`created_at\` bigint
)`);

const journal = JSON.parse(fs.readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf-8"));
let applied = 0, skipped = 0, failed = 0;

for (const entry of journal.entries) {
  const tag = entry.tag;
  const sqlPath = path.join(DRIZZLE_DIR, `${tag}.sql`);
  if (!fs.existsSync(sqlPath)) { console.log(`SKIP (missing file): ${tag}`); skipped++; continue; }
  const sql = fs.readFileSync(sqlPath, "utf-8");
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  const [existing] = await conn.query("SELECT id FROM `__drizzle_migrations` WHERE id = ?", [entry.idx + 1]);
  if (existing.length > 0) { console.log(`SKIP (already applied id=${entry.idx + 1}): ${tag}`); skipped++; continue; }
  const rawChunks = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  // Some migrations bundle multiple ALTERs without breakpoint separators; split further on semicolons
  const statements: string[] = [];
  for (const chunk of rawChunks) {
    for (const part of chunk.split(/;\s*\n?/)) {
      const t = part.trim();
      if (t) statements.push(t);
    }
  }
  console.log(`APPLY ${tag}: ${statements.length} statements...`);
  const shortenFkName = (stmt: string): string => {
    // MariaDB identifier limit is 64 chars; drizzle generates long auto FK names (>64)
    const m = stmt.match(/ADD CONSTRAINT `([^`]+)` FOREIGN KEY/);
    if (!m) return stmt;
    const name = m[1];
    if (name.length <= 64) return stmt;
    // deterministic short name: fk_<hash8>
    const short = "fk_" + crypto.createHash("sha256").update(name).digest("hex").slice(0, 12);
    return stmt.replace(`ADD CONSTRAINT \`${name}\``, `ADD CONSTRAINT \`${short}\``);
  };
  try {
    for (const raw of statements) {
      const stmt = shortenFkName(raw);
      try {
        await conn.query(stmt);
      } catch (e) {
        const code = e.code ?? "";
        const msg = e.sqlMessage ?? e.message ?? "";
        // Idempotency: skip errors for already-existing objects
        if (
          code === "ER_DUP_FIELDNAME" ||
          code === "ER_DUP_KEYNAME" ||
          code === "ER_TABLE_EXISTS_ERROR" ||
          code === "ER_DUP_ENTRY" ||
          /already exists/i.test(msg) ||
          /Duplicate column/i.test(msg) ||
          /Duplicate key/i.test(msg)
        ) {
          // For FK constraint failures where column already exists, still try to add the FK alone
          console.log(`  (skip, exists): ${String(stmt).slice(0, 100)}...`);
          continue;
        }
        throw e;
      }
    }
    await conn.query("INSERT INTO `__drizzle_migrations` (`id`, `hash`, `created_at`) VALUES (?, ?, ?)", [entry.idx + 1, hash, Date.now()]);
    applied++;
    console.log(`  OK ${tag}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${tag}: ${e.code ?? ""} ${e.sqlMessage ?? e.message}`);
    break;
  }
}

console.log(`\nDone. applied=${applied} skipped=${skipped} failed=${failed}`);
await conn.end();
if (failed > 0) process.exit(1);
