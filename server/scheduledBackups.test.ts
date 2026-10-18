import { beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getBackupSettingsByTaskUid, createInventoryBackup } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getBackupSettingsByTaskUid: vi.fn(),
  createInventoryBackup: vi.fn(),
}));

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("./backupDb", () => ({ getBackupSettingsByTaskUid, createInventoryBackup }));

import { runScheduledInventoryBackup } from "./scheduledBackups";

function responseRecorder() {
  const response = { statusCode: 200, body: undefined as unknown };
  const res = {
    status: (statusCode: number) => { response.statusCode = statusCode; return res; },
    json: (body: unknown) => { response.body = body; return res; },
  };
  return { res, response };
}

describe("scheduled inventory backup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-cron callers", async () => {
    authenticateRequest.mockResolvedValue({ isCron: false });
    const { res, response } = responseRecorder();
    await runScheduledInventoryBackup({} as never, res as never);
    expect(response.statusCode).toBe(403);
    expect(createInventoryBackup).not.toHaveBeenCalled();
  });

  it("skips an orphaned scheduled job without failure", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "task-1" });
    getBackupSettingsByTaskUid.mockResolvedValue(undefined);
    const { res, response } = responseRecorder();
    await runScheduledInventoryBackup({} as never, res as never);
    expect(response.body).toEqual({ ok: true, skipped: "orphan" });
    expect(createInventoryBackup).not.toHaveBeenCalled();
  });

  it("creates a scheduled backup for an associated job", async () => {
    authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "task-1" });
    getBackupSettingsByTaskUid.mockResolvedValue({ id: 1, scheduleCronTaskUid: "task-1" });
    createInventoryBackup.mockResolvedValue({ id: 7, createdAt: new Date("2026-08-24T02:00:00.000Z") });
    const { res, response } = responseRecorder();
    await runScheduledInventoryBackup({} as never, res as never);
    expect(createInventoryBackup).toHaveBeenCalledWith({ source: "scheduled", userId: null });
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ ok: true, backupId: 7 });
  });
});
