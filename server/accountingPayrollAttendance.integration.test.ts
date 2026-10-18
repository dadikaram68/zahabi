import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAttendance, accountingBranches, accountingCompanies, accountingEmployees, accountingFiscalPeriods, accountingPayrollLines, accountingPayrollRuns, users } from "../drizzle/schema";
import { approveAttendanceInTransaction, createAccountingEmployeeInTransaction, createPayrollRunInTransaction, recordAttendanceInTransaction, submitAttendanceForApprovalInTransaction, updatePayrollLineInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("payroll attendance database integration", () => {
  it("uses only attendance inside the chosen period and applies policy B overtime without an absence deduction", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار مسير الرواتب");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات تهيئة الرواتب غير مكتملة");
    const rollback = new Error("intentional payroll-attendance test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = Date.now();
        const userResult = await tx.insert(users).values({ openId: `payroll-${suffix}`, name: "منشئ مسير الرواتب", role: "user" });
        const userId = Number(userResult[0].insertId);
        const reviewerResult = await tx.insert(users).values({ openId: `payroll-reviewer-${suffix}`, name: "مراجع حضور", role: "user" });
        const reviewerId = Number(reviewerResult[0].insertId);
        const usdEmployee = await createAccountingEmployeeInTransaction(tx as never, company, { userId, fullName: "موظف رواتب", employeeNumber: `EMP-${suffix}`, salaryAmount: 2_400, salaryCurrencyCode: "USD", salaryExchangeRate: 1, branchId: branch.id });
        const iqdEmployee = await createAccountingEmployeeInTransaction(tx as never, company, { userId, fullName: "موظف دينار", employeeNumber: `IQD-${suffix}`, salaryAmount: 1_500_000, salaryCurrencyCode: "IQD", salaryExchangeRate: 0.00076, branchId: branch.id });
        const employeeId = usdEmployee.id;
        const [storedUsdEmployee] = await tx.select().from(accountingEmployees).where(eq(accountingEmployees.id, usdEmployee.id)).limit(1);
        const [storedIqdEmployee] = await tx.select().from(accountingEmployees).where(eq(accountingEmployees.id, iqdEmployee.id)).limit(1);
        expect(storedUsdEmployee).toMatchObject({ salaryCurrencyCode: "USD", salaryInputMinor: 240_000, salaryExchangeRatePpm: 1_000_000, monthlySalaryMinor: 240_000 });
        expect(storedIqdEmployee).toMatchObject({ salaryCurrencyCode: "IQD", salaryInputMinor: 1_500_000, salaryExchangeRatePpm: 760, monthlySalaryMinor: 1_140 });
        const attendanceEntries = await Promise.all([
          recordAttendanceInTransaction(tx as never, { company }, { userId, employeeId, workDate: new Date("2026-08-05T12:00:00.000Z"), status: "present", overtimeMinutes: 480 }),
          recordAttendanceInTransaction(tx as never, { company }, { userId, employeeId, workDate: new Date("2026-08-06T12:00:00.000Z"), status: "absent", overtimeMinutes: 0 }),
          recordAttendanceInTransaction(tx as never, { company }, { userId, employeeId, workDate: new Date("2026-09-01T12:00:00.000Z"), status: "present", overtimeMinutes: 480 }),
        ]);
        const draftInsidePeriod = await recordAttendanceInTransaction(tx as never, { company }, { userId, employeeId, workDate: new Date("2026-08-07T12:00:00.000Z"), status: "leave", overtimeMinutes: 0 });
        await submitAttendanceForApprovalInTransaction(tx as never, { company }, { userId, attendanceId: attendanceEntries[0]!.id });
        await expect(approveAttendanceInTransaction(tx as never, { company }, { userId, attendanceId: attendanceEntries[0]!.id })).rejects.toThrow("لا يمكن اعتماد سجل الحضور");
        await approveAttendanceInTransaction(tx as never, { company }, { userId: reviewerId, attendanceId: attendanceEntries[0]!.id });
        for (const attendance of attendanceEntries.slice(1)) {
          await submitAttendanceForApprovalInTransaction(tx as never, { company }, { userId, attendanceId: attendance.id });
          await approveAttendanceInTransaction(tx as never, { company }, { userId: reviewerId, attendanceId: attendance.id });
        }
        expect(draftInsidePeriod.approvalStatus).toBe("draft");
        await expect(createPayrollRunInTransaction(tx as never, { company, branch, period }, { userId, name: "رواتب آب", periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T23:59:59.999Z") })).rejects.toThrow("قبل اعتماد جميع سجلات الحضور");
        await submitAttendanceForApprovalInTransaction(tx as never, { company }, { userId, attendanceId: draftInsidePeriod.id });
        await approveAttendanceInTransaction(tx as never, { company }, { userId: reviewerId, attendanceId: draftInsidePeriod.id });
        const created = await createPayrollRunInTransaction(tx as never, { company, branch, period }, { userId, name: "رواتب آب", periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T23:59:59.999Z") });
        const [line] = await tx.select().from(accountingPayrollLines).where(and(eq(accountingPayrollLines.payrollRunId, created.id), eq(accountingPayrollLines.employeeId, employeeId))).limit(1);
        const [run] = await tx.select().from(accountingPayrollRuns).where(eq(accountingPayrollRuns.id, created.id)).limit(1);
        expect(line).toMatchObject({ workingDays: 1, overtimeMinutes: 480, overtimeMinor: 12_000, grossMinor: 252_000, netMinor: 252_000 });
        expect(run?.periodStart).toEqual(new Date("2026-08-01T00:00:00.000Z"));
        expect(run?.periodEnd).toEqual(new Date("2026-08-31T23:59:59.000Z"));
        const adjustment = await updatePayrollLineInTransaction(tx as never, { company }, { payrollRunId: created.id, employeeId, advanceMinor: 5_000, deductionMinor: 7_000 });
        const [adjustedLine] = await tx.select().from(accountingPayrollLines).where(and(eq(accountingPayrollLines.payrollRunId, created.id), eq(accountingPayrollLines.employeeId, employeeId))).limit(1);
        expect(adjustment).toEqual({ grossMinor: 252_000, netMinor: 240_000 });
        expect(adjustedLine).toMatchObject({ workingDays: 1, overtimeMinutes: 480, overtimeMinor: 12_000, grossMinor: 252_000, advanceMinor: 5_000, deductionMinor: 7_000, netMinor: 240_000 });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 15_000);
});
