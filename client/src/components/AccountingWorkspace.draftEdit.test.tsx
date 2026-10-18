import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateDraft: vi.fn() }));

vi.mock("@/lib/trpc", () => {
  const query = (data: unknown) => ({ useQuery: () => ({ data, isLoading: false }) });
  const mutation = (mutate = vi.fn()) => ({ useMutation: () => ({ mutate, isPending: false }) });
  return { trpc: {
    useUtils: () => ({ accounting: { overview: { invalidate: vi.fn() }, documents: { invalidate: vi.fn() }, approvals: { invalidate: vi.fn() }, journals: { invalidate: vi.fn() }, accounts: { invalidate: vi.fn() }, payrollDetails: { invalidate: vi.fn() }, fixedAssets: { invalidate: vi.fn() }, reports: { invalidate: vi.fn() } } }),
    accounting: {
      access: query({ canAccess: true, canManage: true, roles: ["finance_manager"], permissions: ["accounting.manage", "documents.create", "documents.financial.create"] }),
      overview: query({ metrics: { accounts: 0, documents: 1, pending: 0, postedJournals: 0, employees: 0 }, branches: [{ id: 1, name: "الرئيسي" }], recentDocuments: [] }),
      documents: query([{ id: 88, documentNumber: "SAL-1-000088", type: "saleInvoice", status: "draft", totalMinor: 1_000, currencyCode: "USD", createdAt: new Date("2026-08-01"), partnerName: "عميل", branchName: "الرئيسي", canEditDraft: true }]),
      documentDraft: query({ document: { id: 88, type: "saleInvoice", branchId: 1, warehouseId: null, partnerId: null, paymentAccountId: null, destinationWarehouseId: null, costCenterId: null, priceListId: null, currencyCode: "USD", exchangeRatePpm: 1_000_000, dueAt: null, note: "مسودة أصلية" }, lines: [{ id: 11, variantId: null, sourceDocumentLineId: null, description: "خدمة أصلية", quantity: 1, unitPriceMinor: 1_000, discountMinor: 0 }], settlements: [] }),
      accounts: query([]), journals: query([]), approvals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), paymentAccounts: query([]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]),
      createDocument: mutation(), updateDocumentDraft: mutation(mocks.updateDraft), submitDocument: mutation(), cancelDocument: mutation(), approveDocument: mutation(), createPayroll: mutation(), updatePayrollLine: mutation(), submitPayroll: mutation(), approvePayroll: mutation(),
    }, inventory: { overview: query({ items: [] }) }, commerce: { partners: { list: query([]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));
import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace draft editor", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents"); });
  afterEach(() => cleanup());

  it("loads a creator-owned draft and routes its revised lines through the guarded mutation", () => {
    render(<AccountingWorkspace language="ar" />);
    fireEvent.click(screen.getByRole("button", { name: "تعديل المسودة" }));
    expect(screen.getByText("لا يمكن تغيير نوع المستند أو فرعه بعد إنشائه، وتبقى المسودة قابلة للتعديل قبل الإرسال فقط.")).toBeInTheDocument();
    expect((screen.getByLabelText("البيان 1") as HTMLInputElement).value).toBe("خدمة أصلية");
    fireEvent.change(screen.getByLabelText("البيان 1"), { target: { value: "خدمة معدلة" } });
    fireEvent.change(screen.getByLabelText("ملاحظة"), { target: { value: "تعديل موثق" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ تعديل المسودة" }));
    expect(mocks.updateDraft).toHaveBeenCalledWith(expect.objectContaining({ documentId: 88, note: "تعديل موثق", lines: [expect.objectContaining({ description: "خدمة معدلة", quantity: 1, unitPriceMinor: 1_000 })] }));
  });
});
