import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountQuery, journalQuery, approvalQuery, employeeQuery, documentsQuery } = vi.hoisted(() => ({
  accountQuery: vi.fn(),
  journalQuery: vi.fn(),
  approvalQuery: vi.fn(),
  employeeQuery: vi.fn(),
  documentsQuery: vi.fn(),
}));

vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: vi.fn(), isPending: false }) };
  const query = (data: unknown) => ({ useQuery: vi.fn(() => ({ data, isLoading: false })) });
  return {
    trpc: {
      useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() } } }),
      accounting: {
        access: query({ canAccess: true, canManage: false, roles: ["warehouse_keeper"], permissions: [] }),
        overview: query({ metrics: { accounts: 0, documents: 0, pending: 0, postedJournals: 0, employees: 0 }, branches: [], recentDocuments: [] }),
        documents: { useQuery: documentsQuery.mockImplementation(() => ({ data: [{ id: 99, documentNumber: "STO-1-000001", type: "stockTransfer", status: "draft", totalMinor: 0, currencyCode: "USD", createdAt: new Date(), partnerName: null, branchName: "الرئيسي" }], isLoading: false })) },
        documentDraft: query(null),
        accounts: { useQuery: accountQuery.mockImplementation((_input, options) => ({ data: [], isLoading: false, options })) },
        journals: { useQuery: journalQuery.mockImplementation((_input, options) => ({ data: [], isLoading: false, options })) },
        approvals: { useQuery: approvalQuery.mockImplementation((_input, options) => ({ data: [], isLoading: false, options })) },
        employees: { useQuery: employeeQuery.mockImplementation((_input, options) => ({ data: [], isLoading: false, options })) },
        paymentAccounts: query([]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]), payrollDetails: query({ runs: [], lines: [] }),
        createDocument: mutation, updateDocumentDraft: mutation, submitDocument: mutation, cancelDocument: mutation, approveDocument: mutation, createPayroll: mutation, updatePayrollLine: mutation, submitPayroll: mutation, approvePayroll: mutation,
        dailyEntries: query([]), dailyExchangeRate: query({ marketExchangeRate: 1570 }), setDailyExchangeRate: mutation, dailyCashSummary: query({ accounts: [], totals: { openingMinor: 0, receiptMinor: 0, spentMinor: 0, closingMinor: 0 } }), carryForwardCash: mutation, createDailyEntry: mutation, submitDailyEntryForApproval: mutation, approveDailyEntry: mutation, uploadDailyAttachment: mutation, importTotal9: mutation,
      },
      inventory: { overview: query({ items: [] }) },
      commerce: { partners: { list: query([]) } },
    },
  };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));

import { AccountingWorkspace, safeDateKey } from "./AccountingWorkspace";

describe("AccountingWorkspace restricted role", () => {
  beforeEach(() => {
    accountQuery.mockClear(); journalQuery.mockClear(); approvalQuery.mockClear(); employeeQuery.mockClear(); documentsQuery.mockClear();
    window.history.replaceState({}, "", "/?view=accounting&accountingTab=reports&newDocument=1");
  });

  it("normalizes malformed report dates to an API-safe date key", () => {
    expect(safeDateKey("2026-10-08")).toBe("2026-10-08");
    expect(safeDateKey("08/10/2026")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("hides financial tabs, limits document choices, and disables prohibited queries for a warehouse keeper", () => {
    render(<AccountingWorkspace language="ar" />);
    expect(screen.queryByText("دليل الحسابات")).not.toBeInTheDocument();
    expect(screen.queryByText("التقارير المالية")).not.toBeInTheDocument();
    expect(screen.queryByText("الأصول الثابتة")).not.toBeInTheDocument();
    expect(screen.getByText("لا تملك صلاحية الوصول إلى هذا القسم، لذلك تم تحويلك إلى لوحة المحاسبة.")).toBeInTheDocument();
    expect(screen.getByText("تحويل مخزني")).toBeInTheDocument();
    expect(screen.queryByText("فاتورة مبيعات")).not.toBeInTheDocument();
    expect(accountQuery.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(journalQuery.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(approvalQuery.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(employeeQuery.mock.calls[0]?.[1]).toEqual({ enabled: false });
  });

  it("renders submission for the warehouse keeper transfer but not financial approval actions", () => {
    window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents");
    render(<AccountingWorkspace language="ar" />);
    expect(screen.getByText("STO-1-000001")).toBeInTheDocument();
    expect(screen.getByText("طلب موافقة")).toBeInTheDocument();
    expect(screen.getByText("إلغاء المسودة")).toBeInTheDocument();
    expect(screen.queryByText("اعتماد وترحيل")).not.toBeInTheDocument();
    expect(screen.queryByText("فاتورة مبيعات")).not.toBeInTheDocument();
  });

});
