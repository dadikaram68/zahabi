import { describe, expect, it } from "vitest";
import { calculatePolicyBPayrollLine } from "./accountingDb";

describe("payroll policy B", () => {
  it("keeps the monthly salary when an employee is absent and adds overtime at 1.5 times the hourly rate", () => {
    const result = calculatePolicyBPayrollLine(240_000, [
      { status: "present", overtimeMinutes: 480 },
      { status: "absent", overtimeMinutes: 0 },
    ]);
    expect(result).toEqual({
      workingDays: 1,
      overtimeMinutes: 480,
      overtimeMinor: 12_000,
      grossMinor: 252_000,
      netMinor: 252_000,
    });
  });
});
