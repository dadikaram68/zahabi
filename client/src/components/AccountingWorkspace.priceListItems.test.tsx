import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      documents: query([]), documentDraft: query(null), accounts: query([]), approvals: query([]), journals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), paymentAccounts: query([]), priceLists: query([{ id: 5, code: "RETAIL", name: "قطاعي", currencyCode: "USD", maxDiscountBps: 500 }]), priceListItems: query({ items: [{ id: 9, variantId: 17, unitPriceMinor: 250, itemName: "مادة اختبار", color: null, size: null, barcode: "PL-17", tiers: [{ id: 4, minimumQuantity: 5, unitPriceMinor: 200 }] }] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([]), returnableSalesLines: query([]), returnablePurchaseLines: query([]),
      createDocument: mutation(mocks.createDocument), updateDocumentDraft: mutation(), submitDocument: mutation(), cancelDocument: mutation(), approveDocument: mutation(), createPayroll: mutation(), updatePayrollLine: mutation(), submitPayroll: mutation(), approvePayroll: mutation(),
    }, inventory: { overview: query({ items: [{ name: "مادة اختبار", variants: [{ id: 17, color: null, size: null }] }] }) }, commerce: { partners: { list: query([]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));
import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace price-list item application", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents&newDocument=1&documentType=saleInvoice"); });
  afterEach(() => cleanup());

  it("fills the saved list price for a selected sales item and submits it in the draft", async () => {
    render(<AccountingWorkspace language="ar" />);
    fireEvent.change(screen.getByLabelText("قائمة الأسعار"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("الصنف المخزني"), { target: { value: "17" } });
    await waitFor(() => expect((screen.getByLabelText("سعر الوحدة") as HTMLInputElement).value).toBe("250"));
    fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "5" } });
    await waitFor(() => expect((screen.getByLabelText("سعر الوحدة") as HTMLInputElement).value).toBe("200"));
    fireEvent.change(screen.getByLabelText("البيان 1"), { target: { value: "بيع مسعر" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة" }));
    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "saleInvoice", priceListId: 5, lines: [expect.objectContaining({ variantId: 17, quantity: 5, unitPriceMinor: 200, description: "بيع مسعر" })] }));
  });
});
