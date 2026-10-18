import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, record: vi.fn(), submit: vi.fn(), approve: vi.fn() }));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { attendance: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() } } }),
  accounting: {
    attendance: { useQuery: () => ({ data: mocks.rows, isLoading: false }) },
    recordAttendance: { useMutation: () => ({ mutate: mocks.record, isPending: false }) },
    submitAttendance: { useMutation: () => ({ mutate: mocks.submit, isPending: false }) },
    approveAttendance: { useMutation: () => ({ mutate: mocks.approve, isPending: false }) },
  },
} }));

import { AttendanceReviewPanel } from "./AttendanceReviewPanel";

describe("AttendanceReviewPanel", () => {
  beforeEach(() => { mocks.rows = []; mocks.record.mockClear(); mocks.submit.mockClear(); mocks.approve.mockClear(); });

  it("sends an HR attendance draft for review without exposing approval", () => {
    mocks.rows = [{ id: 41, employeeName: "موظف تجريبي", workDate: new Date("2026-08-05T00:00:00.000Z"), status: "present", overtimeMinutes: 60, approvalStatus: "draft" }];
    render(<AttendanceReviewPanel employees={[{ id: 1, fullName: "موظف تجريبي" }]} canApprove={false} />);
    fireEvent.click(screen.getByRole("button", { name: "إرسال للمراجعة" }));
    expect(mocks.submit).toHaveBeenCalledWith({ attendanceId: 41 });
    expect(screen.queryByRole("button", { name: "اعتماد" })).toBeNull();
  });

  it("allows an authorized reviewer to approve a pending attendance record", () => {
    mocks.rows = [{ id: 42, employeeName: "موظف تجريبي", workDate: new Date("2026-08-05T00:00:00.000Z"), status: "present", overtimeMinutes: 60, approvalStatus: "pendingApproval" }];
    render(<AttendanceReviewPanel employees={[{ id: 1, fullName: "موظف تجريبي" }]} canApprove />);
    fireEvent.click(screen.getByRole("button", { name: "اعتماد" }));
    expect(mocks.approve).toHaveBeenCalledWith({ attendanceId: 42 });
  });
});
