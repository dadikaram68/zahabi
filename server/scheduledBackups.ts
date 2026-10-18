import type { Request, Response } from "express";
import { createInventoryBackup, getBackupSettingsByTaskUid } from "./backupDb";
import { sdk } from "./_core/sdk";

export async function runScheduledInventoryBackup(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const settings = await getBackupSettingsByTaskUid(user.taskUid);
    if (!settings) return res.json({ ok: true, skipped: "orphan" });
    const backup = await createInventoryBackup({ source: "scheduled", userId: null });
    return res.json({ ok: true, backupId: backup.id, createdAt: backup.createdAt });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "scheduled backup failed",
      timestamp: new Date().toISOString(),
    });
  }
}
