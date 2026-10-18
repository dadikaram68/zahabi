import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createDocument: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false }) });
  const mutation = (mutate = vi.fn()) => ({ useMutation: () => ({ mutate, isPending: false }) });
  return { trpc: {
    useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() }, fixedAssets: { invalidate: vi.fn() } } }),
    accounting: {
      access: query({ canAccess: true, canManage: true, roles: ["finance_manager"], permissions: ["accounting.manage", "documents.create", "documents.financial.create"] }),
      overview: query({ metrics: { accounts: 0, documents: 0, pending: 0, postedJournals: 0, employees: 0 }, branches: [{ id: 1, name: "الرئيسي" }], recentDocuments: [] }),
      documents: query([]), documentDraft: query(null), accounts: query([]), approvals: query([]), journals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), paymentAccounts: query([{ id: 8, name: "دفتر الشيكات", type: "cheque", currencyCode: "USD" }]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]),
      createDocument: mutation(mocks.createDocument), updateDocumentDraft: mutation(), submitDocument: mutation(), cancelDocument: mutation(), approveDocument: mutation(), createPayroll: mutation(), updatePayrollLine: mutation(), submitPayroll: mutation(), approvePayroll: mutation(),
    }, inventory: { overview: query({ items: [] }) }, commerce: { partners: { list: query([]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));
import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace cheque document", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents&newDocument=1&documentType=receipt"); });
  afterEach(() => cleanup());

  it("shows and submits a cheque number only when a cheque payment account is selected", () => {
    render(<AccountingWorkspace language="ar" />);
    fireEvent.change(screen.getByLabelText("حساب الدفع"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("رقم الشيك"), { target: { value: "CHQ-008" } });
    fireEvent.change(screen.getByLabelText("البيان 1"), { target: { value: "قبض شيك" } });
    fireEvent.change(screen.getByLabelText("سعر الوحدة"), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة" }));
    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "receipt", paymentAccountId: 8, chequeNumber: "CHQ-008" }));
  });
});
