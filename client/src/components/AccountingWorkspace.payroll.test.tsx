import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createPayroll: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: vi.fn(), isPending: false }) };
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false }) });
  return { trpc: {
    useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() } } }),
    accounting: {
      access: query({ canAccess: true, canManage: false, roles: ["hr_manager"], permissions: [] }),
      overview: query({ metrics: { accounts: 0, documents: 0, pending: 0, postedJournals: 0, employees: 0 }, branches: [], recentDocuments: [] }),
      documents: query([]), documentDraft: query(null), accounts: query([]), approvals: query([]), journals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }),
      paymentAccounts: query([]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]),
      createDocument: mutation, updateDocumentDraft: mutation, submitDocument: mutation, cancelDocument: mutation, approveDocument: mutation, createPayroll: { useMutation: () => ({ mutate: mocks.createPayroll, isPending: false }) }, updatePayrollLine: mutation, submitPayroll: mutation, approvePayroll: mutation,
    },
    inventory: { overview: query({ items: [] }) }, commerce: { partners: { list: query([]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));
vi.mock("./AttendanceReviewPanel", () => ({ AttendanceReviewPanel: () => null }));
vi.mock("./EmployeeQuickAdd", () => ({ EmployeeQuickAdd: () => null }));
vi.mock("./PayrollPeriodForm", () => ({ PayrollPeriodForm: ({ onCreate }: { onCreate: (input: unknown) => void }) => <section aria-label="نموذج فترة الرواتب"><button onClick={() => onCreate({ name: "رواتب آب", periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T23:59:59.999Z") })}>إنشاء فترة اختبار</button></section> }));

import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace payroll tab", () => {
  it("renders payroll for HR without redirecting and forwards a selected period", () => {
    window.history.replaceState({}, "", "/?view=accounting&accountingTab=payroll");
    render(<AccountingWorkspace language="ar" />);
    expect(screen.getByRole("region", { name: "نموذج فترة الرواتب" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إنشاء فترة اختبار" }));
    expect(mocks.createPayroll).toHaveBeenCalledWith({ name: "رواتب آب", periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T23:59:59.999Z") });
  });
});
