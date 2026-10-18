import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false }) });
  const mutation = { useMutation: () => ({ mutate: vi.fn(), isPending: false }) };
  return { trpc: {
    useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() } } }),
    accounting: {
      access: query({ canAccess: true, canManage: true, roles: ["finance_manager"], permissions: [] }),
      overview: query({ metrics: { accounts: 0, documents: 0, pending: 0, postedJournals: 1, employees: 0 }, branches: [], recentDocuments: [] }),
      documents: query([]), documentDraft: query(null), accounts: query([]), approvals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), paymentAccounts: query([]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]),
      journals: query([{ id: 8, entryNumber: "J-SAL-000001", sourceType: "document", entryDate: new Date("2026-08-05T00:00:00.000Z"), costCenters: ["OPS — العمليات"] }]),
      createDocument: mutation, updateDocumentDraft: mutation, submitDocument: mutation, cancelDocument: mutation, approveDocument: mutation, createPayroll: mutation, updatePayrollLine: mutation, submitPayroll: mutation, approvePayroll: mutation,
    },
    inventory: { overview: query({ items: [] }) }, commerce: { partners: { list: query([]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));

import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace journal attribution", () => {
  it("shows the cost center carried by journal lines", () => {
    window.history.replaceState({}, "", "/?view=accounting&accountingTab=journals");
    render(<AccountingWorkspace language="ar" />);
    expect(screen.getByText("J-SAL-000001")).toBeTruthy();
    expect(screen.getByText("مركز التكلفة: OPS — العمليات")).toBeTruthy();
  });
});
