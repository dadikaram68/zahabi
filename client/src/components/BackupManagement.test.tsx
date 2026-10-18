import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overview: {
    settings: {
      retentionDays: 30,
      dailyBackupHourUtc: 2,
      scheduleCronTaskUid: "Go2fepBfUYbBNPxbquZdkr",
      lastBackupAt: new Date("2026-08-26T02:12:53.000Z"),
    },
    backups: [],
  },
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ backups: { overview: { invalidate: vi.fn() } }, inventory: { overview: { invalidate: vi.fn() }, history: { invalidate: vi.fn() } }, commerce: { invalidate: vi.fn() } }),
  backups: {
    overview: { useQuery: () => ({ data: mocks.overview, isLoading: false }) },
    createNow: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    updateSettings: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    enableDailySchedule: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    verify: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    restore: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));

import { BackupManagement } from "./BackupManagement";

describe("BackupManagement", () => {
  afterEach(cleanup);

  it("shows an unambiguous active status when a scheduled backup task and successful backup are persisted", () => {
    render(<BackupManagement language="ar" />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("النسخ اليومي نشط");
    expect(status.textContent).toContain("آخر نسخة ناجحة");
    expect(status.textContent).toContain("Go2fepBfUYbBNPxbquZdkr");
    expect((screen.getByRole("button", { name: "النسخ اليومي مفعّل" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
