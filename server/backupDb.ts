import { desc, eq } from "drizzle-orm";
import { gunzipSync, gzipSync } from "node:zlib";
import {
  businessPartners,
  inventoryBackupSettings,
  inventoryBackups,
  inventoryInvoiceLines,
  inventoryInvoices,
  inventoryItems,
  inventoryMovements,
  inventorySettings,
  inventoryVariants,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";

type BackupSource = "scheduled" | "manual" | "pre_restore";

type InventorySnapshot = {
  version: 1;
  createdAt: string;
  tables: {
    inventorySettings: unknown[];
    inventoryItems: unknown[];
    inventoryVariants: unknown[];
    inventoryMovements: unknown[];
    businessPartners: unknown[];
    inventoryInvoices: unknown[];
    inventoryInvoiceLines: unknown[];
  };
};

function toJsonable<T>(rows: T[]): T[] {
  return JSON.parse(JSON.stringify(rows)) as T[];
}

export function getDailyBackupRetentionCutoff(
  now: Date,
  retentionDays: number
) {
  return new Date(
    now.getTime() - Math.max(retentionDays, 1) * 24 * 60 * 60 * 1000
  );
}

export function selectExpiredScheduledBackups<
  T extends { source: BackupSource; createdAt: Date; id: number },
>(backups: T[], cutoff: Date) {
  return backups.filter(
    backup => backup.source === "scheduled" && backup.createdAt < cutoff
  );
}

async function ensureBackupSettings() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const existing = await db.select().from(inventoryBackupSettings).limit(1);
  if (existing[0]) return existing[0];
  const result = await db
    .insert(inventoryBackupSettings)
    .values({ retentionDays: 30, dailyBackupHourUtc: 2 });
  const created = await db
    .select()
    .from(inventoryBackupSettings)
    .where(eq(inventoryBackupSettings.id, Number(result[0].insertId)))
    .limit(1);
  return created[0]!;
}

export async function getBackupOverview() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const settings = await ensureBackupSettings();
  const backups = await db
    .select()
    .from(inventoryBackups)
    .orderBy(desc(inventoryBackups.createdAt))
    .limit(100);
  return { settings, backups };
}

export async function updateBackupSettings(input: {
  retentionDays: number;
  dailyBackupHourUtc: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const settings = await ensureBackupSettings();
  await db
    .update(inventoryBackupSettings)
    .set(input)
    .where(eq(inventoryBackupSettings.id, settings.id));
  return { ...settings, ...input };
}

export async function persistBackupScheduleTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const settings = await ensureBackupSettings();
  await db
    .update(inventoryBackupSettings)
    .set({ scheduleCronTaskUid: taskUid })
    .where(eq(inventoryBackupSettings.id, settings.id));
}

export async function getBackupSettingsByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const rows = await db
    .select()
    .from(inventoryBackupSettings)
    .where(eq(inventoryBackupSettings.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0];
}

export async function createInventoryBackup(input: {
  source: BackupSource;
  userId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [
    settings,
    items,
    variants,
    movements,
    partners,
    invoices,
    invoiceLines,
  ] = await Promise.all([
    db.select().from(inventorySettings),
    db.select().from(inventoryItems),
    db.select().from(inventoryVariants),
    db.select().from(inventoryMovements),
    db.select().from(businessPartners),
    db.select().from(inventoryInvoices),
    db.select().from(inventoryInvoiceLines),
  ]);
  const snapshot: InventorySnapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: {
      inventorySettings: toJsonable(settings),
      inventoryItems: toJsonable(items),
      inventoryVariants: toJsonable(variants),
      inventoryMovements: toJsonable(movements),
      businessPartners: toJsonable(partners),
      inventoryInvoices: toJsonable(invoices),
      inventoryInvoiceLines: toJsonable(invoiceLines),
    },
  };
  const recordCounts = {
    items: items.length,
    variants: variants.length,
    movements: movements.length,
    partners: partners.length,
    invoices: invoices.length,
    invoiceLines: invoiceLines.length,
  };
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const label = `${input.source === "scheduled" ? "نسخة يومية" : input.source === "pre_restore" ? "نسخة أمان قبل الاستعادة" : "نسخة يدوية"} ${now.toLocaleString("sv-SE", { timeZone: "UTC" })} UTC`;
  const payload = gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8"));
  const stored = await storagePut(
    `inventory-backups/inventory-${stamp}.json.gz`,
    payload,
    "application/gzip"
  );
  const result = await db.insert(inventoryBackups).values({
    label,
    source: input.source,
    storageKey: stored.key,
    storageUrl: stored.url,
    recordCounts: JSON.stringify(recordCounts),
    createdBy: input.userId ?? null,
  });
  const backupId = Number(result[0].insertId);
  const backupSettings = await ensureBackupSettings();
  await db
    .update(inventoryBackupSettings)
    .set({ lastBackupAt: now })
    .where(eq(inventoryBackupSettings.id, backupSettings.id));
  const cutoff = getDailyBackupRetentionCutoff(
    now,
    backupSettings.retentionDays
  );
  const allBackupMetadata = await db
    .select({
      id: inventoryBackups.id,
      source: inventoryBackups.source,
      createdAt: inventoryBackups.createdAt,
    })
    .from(inventoryBackups);
  const staleDailyBackups = selectExpiredScheduledBackups(
    allBackupMetadata,
    cutoff
  );
  for (const staleBackup of staleDailyBackups)
    await db
      .delete(inventoryBackups)
      .where(eq(inventoryBackups.id, staleBackup.id));
  const saved = await db
    .select()
    .from(inventoryBackups)
    .where(eq(inventoryBackups.id, backupId))
    .limit(1);
  return saved[0]!;
}

function reviveDates<T extends Record<string, unknown>>(row: T): T {
  const revived = { ...row } as Record<string, unknown>;
  for (const field of ["createdAt", "updatedAt", "lastBackupAt"]) {
    if (typeof revived[field] === "string")
      revived[field] = new Date(revived[field] as string);
  }
  return revived as T;
}

export function parseInventorySnapshot(raw: Buffer): InventorySnapshot {
  let snapshot: InventorySnapshot;
  try {
    snapshot = JSON.parse(
      gunzipSync(raw).toString("utf8")
    ) as InventorySnapshot;
  } catch {
    throw new Error("ملف النسخة الاحتياطية تالف أو غير مضغوط بشكل صحيح");
  }
  if (
    snapshot.version !== 1 ||
    !snapshot.tables ||
    Object.values(snapshot.tables).some(table => !Array.isArray(table))
  )
    throw new Error("بنية النسخة الاحتياطية غير مدعومة");
  return snapshot;
}

export async function restoreInventoryBackup(backupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const rows = await db
    .select()
    .from(inventoryBackups)
    .where(eq(inventoryBackups.id, backupId))
    .limit(1);
  const backup = rows[0];
  if (!backup) throw new Error("النسخة المطلوبة غير موجودة");
  await createInventoryBackup({ source: "pre_restore", userId });
  const signedUrl = await storageGetSignedUrl(backup.storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("تعذر تنزيل ملف النسخة الاحتياطية");
  const raw = Buffer.from(await response.arrayBuffer());
  const snapshot = parseInventorySnapshot(raw);
  await db.transaction(async tx => {
    await tx.delete(inventoryInvoiceLines);
    await tx.delete(inventoryInvoices);
    await tx.delete(inventoryMovements);
    await tx.delete(inventoryVariants);
    await tx.delete(inventoryItems);
    await tx.delete(businessPartners);
    await tx.delete(inventorySettings);
    const tables = snapshot.tables;
    if (tables.inventorySettings.length)
      await tx
        .insert(inventorySettings)
        .values(
          tables.inventorySettings.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
    if (tables.businessPartners.length)
      await tx
        .insert(businessPartners)
        .values(
          tables.businessPartners.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
    if (tables.inventoryItems.length)
      await tx
        .insert(inventoryItems)
        .values(
          tables.inventoryItems.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
    if (tables.inventoryVariants.length)
      await tx
        .insert(inventoryVariants)
        .values(
          tables.inventoryVariants.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
    if (tables.inventoryInvoices.length)
      await tx
        .insert(inventoryInvoices)
        .values(
          tables.inventoryInvoices.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
    if (tables.inventoryInvoiceLines.length)
      await tx
        .insert(inventoryInvoiceLines)
        .values(tables.inventoryInvoiceLines as any);
    if (tables.inventoryMovements.length)
      await tx
        .insert(inventoryMovements)
        .values(
          tables.inventoryMovements.map(row =>
            reviveDates(row as Record<string, unknown>)
          ) as any
        );
  });
  return { restoredBackupId: backupId, safetyBackupCreated: true };
}

export async function verifyInventoryBackup(backupId: number) {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const [backup] = await db
    .select()
    .from(inventoryBackups)
    .where(eq(inventoryBackups.id, backupId))
    .limit(1);
  if (!backup) throw new Error("النسخة المطلوبة غير موجودة");
  const signedUrl = await storageGetSignedUrl(backup.storageKey);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("تعذر تنزيل ملف النسخة الاحتياطية للفحص");
  const snapshot = parseInventorySnapshot(
    Buffer.from(await response.arrayBuffer())
  );
  return {
    valid: true as const,
    backupId,
    recordCounts: Object.fromEntries(
      Object.entries(snapshot.tables).map(([name, rows]) => [name, rows.length])
    ),
  };
}
