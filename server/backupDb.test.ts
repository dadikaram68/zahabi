import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { getDailyBackupRetentionCutoff, parseInventorySnapshot, selectExpiredScheduledBackups } from "./backupDb";

describe("daily backup retention", () => {
  it("keeps the requested number of calendar days", () => {
    const now = new Date("2026-08-24T02:00:00.000Z");
    expect(getDailyBackupRetentionCutoff(now, 30).toISOString()).toBe("2026-07-25T02:00:00.000Z");
  });

  it("never calculates a zero-day retention window", () => {
    const now = new Date("2026-08-24T02:00:00.000Z");
    expect(getDailyBackupRetentionCutoff(now, 0).toISOString()).toBe("2026-08-23T02:00:00.000Z");
  });

  it("selects only expired scheduled backups and preserves manual safety copies", () => {
    const cutoff = new Date("2026-07-25T02:00:00.000Z");
    const selected = selectExpiredScheduledBackups([
      { id: 1, source: "scheduled" as const, createdAt: new Date("2026-07-20T02:00:00.000Z") },
      { id: 2, source: "scheduled" as const, createdAt: new Date("2026-08-01T02:00:00.000Z") },
      { id: 3, source: "manual" as const, createdAt: new Date("2026-07-01T02:00:00.000Z") },
      { id: 4, source: "pre_restore" as const, createdAt: new Date("2026-07-01T02:00:00.000Z") },
    ], cutoff);
    expect(selected.map(backup => backup.id)).toEqual([1]);
  });

  it("validates a compressed snapshot before restore and rejects corrupt data", () => {
    const tables = { inventorySettings: [], inventoryItems: [{ id: 7 }], inventoryVariants: [], inventoryMovements: [], businessPartners: [], inventoryInvoices: [], inventoryInvoiceLines: [] };
    const snapshot = parseInventorySnapshot(gzipSync(Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), tables }))));
    expect(snapshot.tables.inventoryItems).toHaveLength(1);
    expect(() => parseInventorySnapshot(Buffer.from("not-a-backup"))).toThrow("تالف");
    expect(() => parseInventorySnapshot(gzipSync(Buffer.from(JSON.stringify({ version: 99, tables }))))) .toThrow("غير مدعومة");
  });
});
