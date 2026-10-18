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
      documents: query([]), documentDraft: query(null), accounts: query([]), approvals: query([]), journals: query([]), employees: query([]), payrollDetails: query({ runs: [], lines: [] }), paymentAccounts: query([]), priceLists: query([]), priceListItems: query({ items: [] }), costCenters: query([]), settlementTargets: query([]), warehouses: query([{ id: 4, branchName: "الرئيسي", name: "مخزن الاستلام" }]), returnableSalesLines: query([]),
      returnablePurchaseLines: query([{ id: 501, documentNumber: "PUR-1-000501", variantId: 17, description: "مادة مشتراة", quantity: 5, availableQuantity: 3, unitPriceMinor: 120, discountMinor: 10, lineTotalMinor: 590, currencyCode: "IQD", exchangeRatePpm: 637, marketExchangeRate: "1570", partnerId: 8, warehouseId: 4 }]),
      createDocument: mutation(mocks.createDocument), updateDocumentDraft: mutation(), submitDocument: mutation(), cancelDocument: mutation(), approveDocument: mutation(), createPayroll: mutation(), updatePayrollLine: mutation(), submitPayroll: mutation(), approvePayroll: mutation(),
    }, inventory: { overview: query({ items: [{ name: "مادة", variants: [{ id: 17, color: null, size: null }] }] }) }, commerce: { partners: { list: query([{ id: 8, name: "المورد المصدر", type: "supplier" }]) } },
  } };
});
vi.mock("./AccountingPanels", () => ({ AccountingAdministrationPanel: () => null, FinancialReportsPanel: () => null }));
import { AccountingWorkspace } from "./AccountingWorkspace";

describe("AccountingWorkspace purchase return", () => {
  beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, "", "/?view=accounting&accountingTab=documents&newDocument=1&documentType=purchaseReturn"); });
  afterEach(() => cleanup());

  it("requires a posted purchase source and submits its protected price, currency, vendor, warehouse, and source line", () => {
    render(<AccountingWorkspace language="ar" />);
    fireEvent.change(screen.getByLabelText("سطر فاتورة الشراء الأصلي"), { target: { value: "501" } });
    expect((screen.getByLabelText("البيان 1") as HTMLInputElement).value).toBe("مادة مشتراة");
    expect((screen.getByLabelText("سعر الوحدة") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("الخصم") as HTMLInputElement).value).toBe("2");
    fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "2" } });
    expect((screen.getByLabelText("الخصم") as HTMLInputElement).value).toBe("4");
    expect(screen.getByDisplayValue("1570")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حفظ مسودة" }));
    expect(mocks.createDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "purchaseReturn", partnerId: 8, warehouseId: 4, currencyCode: "IQD", marketExchangeRate: 1570, lines: [expect.objectContaining({ variantId: 17, sourceDocumentLineId: 501, description: "مادة مشتراة", quantity: 2, unitPriceMinor: 120, discountMinor: 4 })] }));
  });
});
