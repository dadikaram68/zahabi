import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createDocument: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false }) });
  const mutation = (mutate = vi.fn()) => ({ useMutation: () => ({ mutate, isPending: false }) });
  return { trpc: {
    useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() } } }),
    accounting: {
      access: query({ canAccess: true, canManage: true, roles: ["finance_manager"], permissions: ["accounting.manage", "documents.create", "documents.financial.create"] }),
      overview: query({ metrics: { accounts: 0, documents: 0, pending: 0, postedJournals: 0, employees: 0 }, branches: [{ id: 1, name: "الرئيسي" }], recentDocuments: [] }),
      documents: query([]), documentDraft: query(null), accounts: query([]), journals: query([]), approvals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]), priceListItems: query({ items: [] }),
      paymentAccounts: query([{ id: 9, name: "الصندوق الرئيسي", type: "cash", currencyCode: "USD", branchId: null }]), priceLists: query([{ id: 14, code: "RETAIL", name: "مفرد", currencyCode: "USD", maxDiscountBps: 500 }]), costCenters: query([{ id: 12, code: "OPS", name: "العمليات", isActive: true }]),
      settlementTargets: query([{ id: 101, documentNumber: "SAL-1-000101", partnerId: 5, partnerName: "عميل الاختبار", currencyCode: "USD", totalMinor: 1_000, outstandingMinor: 400 }]),
      createDocument: mutation(mocks.createDocument), updateDocumentDraft: mutation(), submitDocument: mutation(), cancelDocument: mutation(), approveDocument: mutation(), createPayroll: mutation(), updatePayrollLine: mutation(), submitPayroll: mutation(), approvePayroll: mutation(),
    },
    inventory: { overview: query({ items: [] }) },
    commerce: { partners: { list: query([{ id: 5, name: "عميل الاختبار", type: "customer" }]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));

import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace receipt settlement", () => {
  beforeEach(() => { mocks.createDocument.mockReset(); window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents&newDocument=1&documentType=receipt"); });

  it("adds the selected open invoice and its allocation amount to the receipt creation request", () => {
    render(<AccountingWorkspace language="ar" />);
    fireEvent.change(screen.getByLabelText("العميل أو المورد"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("حساب الدفع"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("قائمة الأسعار"), { target: { value: "14" } });
    fireEvent.change(screen.getByLabelText("مركز التكلفة"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة فاتورة للتسوية" }));
    fireEvent.change(screen.getByLabelText("الفاتورة المرحلة"), { target: { value: "101" } });
    expect((screen.getByLabelText("مبلغ التخصيص") as HTMLInputElement).value).toBe("400");
    fireEvent.change(screen.getByLabelText("البيان 1"), { target: { value: "قبض جزئي" } });
    fireEvent.change(screen.getByLabelText("سعر الوحدة"), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة" }));
    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "receipt", partnerId: 5, paymentAccountId: 9, priceListId: 14, costCenterId: 12, settlements: [{ targetDocumentId: 101, amountMinor: 400 }] }));
  });
});
