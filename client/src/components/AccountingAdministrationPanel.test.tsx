import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assignRole: vi.fn(),
  createCostCenter: vi.fn(),
  updateCostCenter: vi.fn(),
  updatePaymentAccount: vi.fn(),
  createInternalUser: vi.fn(),
  updateInternalUser: vi.fn(),
  resetInternalUserPassword: vi.fn(),
  updateCompanyBranding: vi.fn(),
  updateCompanyCountry: vi.fn(),
  invalidate: vi.fn(),
  configuration: {
    branches: [{ id: 1, code: "PRIMARY", name: "الفرع الرئيسي" }],
    currencies: [{ code: "USD" }, { code: "USD" }],
    roles: [
      { id: 1, name: "مدير النظام", code: "system_admin", isSystem: true },
      { id: 93, name: "مشرف مخزون مخصص", code: "custom_inventory_supervisor", isSystem: false },
    ],
    employees: [],
    priceLists: [],
    users: [{ id: 11, name: "موظف المخزون", email: null }, { id: 12, name: "المحاسب الأول", email: null, username: "accountant.1", isInternalUser: true, isActive: true, lastInternalSignedIn: null }],
    assignments: [],
    rolePermissions: [],
    paymentAccounts: [] as Array<{ id: number; name: string; type: "cash" | "bank" | "cheque"; currencyCode: string; branchId: number | null; isActive: boolean }>,
    costCenters: [{ id: 17, code: "OPS", name: "العمليات", isActive: true }],
    closeReadiness: { canClose: false, unpostedDocuments: 2, unpostedPayrollRuns: 1, unpostedJournalEntries: 0, unbalancedJournalEntries: 0, totalDebitMinor: 0, totalCreditMinor: 0 },
    companyBranding: { brandName: null as string | null, brandLogoUrl: null as string | null, brandLogoKey: null as string | null, showProductName: true, countryCode: "IQ" },
  },
}));

vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ accounting: { configuration: { invalidate: mocks.invalidate }, publicBranding: { invalidate: mocks.invalidate }, priceListItems: { invalidate: mocks.invalidate }, cheques: { invalidate: mocks.invalidate }, journals: { invalidate: mocks.invalidate }, reports: { invalidate: mocks.invalidate }, employeeContracts: { invalidate: mocks.invalidate }, employeeLeaves: { invalidate: mocks.invalidate } }, auth: { mfaStatus: { invalidate: mocks.invalidate }, sessions: { invalidate: mocks.invalidate } } }),
  auth: {
    mfaStatus: { useQuery: () => ({ data: { enabled: false, mode: "totp", emailConfigured: false } }) },
    beginMfaSetup: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    confirmMfaSetup: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    disableMfa: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    sessions: { useQuery: () => ({ data: [] }) },
    revokeSession: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
  },
  accounting: {
    access: { useQuery: () => ({ data: { canManage: true, roles: ["system_admin"] } }) },
    configuration: { useQuery: () => ({ data: mocks.configuration, isLoading: false }) },
    employeeContracts: { useQuery: () => ({ data: [] }) },
    employeeLeaves: { useQuery: () => ({ data: [] }) },
    securitySettings: { useQuery: () => ({ data: { sessionDurationMinutes: 1440, maxFailedAttempts: 5 } }) },
    warehouseBalances: { useQuery: () => ({ data: [] }) },
    paymentAccounts: { useQuery: () => ({ data: [] }) },
    cheques: { useQuery: () => ({ data: [] }) },
    priceLists: { useQuery: () => ({ data: [] }) },
    priceListItems: { useQuery: () => ({ data: { items: [] } }) },
    createBranch: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    createEmployee: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    createEmployeeContract: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    createEmployeeLeave: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    approveEmployeeLeave: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    updateSecuritySettings: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    assignRole: { useMutation: () => ({ mutate: mocks.assignRole, isPending: false }) },
    createInternalUser: { useMutation: () => ({ mutate: mocks.createInternalUser, isPending: false }) },
    updateInternalUser: { useMutation: () => ({ mutate: mocks.updateInternalUser, isPending: false }) },
    resetInternalUserPassword: { useMutation: () => ({ mutate: mocks.resetInternalUserPassword, isPending: false }) },
    createPaymentAccount: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    updatePaymentAccount: { useMutation: () => ({ mutate: mocks.updatePaymentAccount, isPending: false }) },
    createCostCenter: { useMutation: () => ({ mutate: mocks.createCostCenter, isPending: false }) },
    updateCostCenter: { useMutation: () => ({ mutate: (input: unknown, options?: { onSuccess?: () => void }) => { mocks.updateCostCenter(input); options?.onSuccess?.(); }, isPending: false }) },
    uploadCompanyLogo: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    updateCompanyBranding: { useMutation: () => ({ mutate: mocks.updateCompanyBranding, isPending: false }) },
    updateCompanyCountry: { useMutation: () => ({ mutate: mocks.updateCompanyCountry, isPending: false }) },
    recordAttendance: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    closePeriod: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    upsertPriceListItem: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    upsertPriceListItemTier: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
    settleCheque: { useMutation: () => ({ mutate: () => undefined, isPending: false }) },
  },
  inventory: { overview: { useQuery: () => ({ data: { items: [] } }) } },
} }));
vi.mock("@/components/PermissionBoard", () => ({ PermissionBoard: () => null }));

import { AccountingAdministrationPanel } from "./AccountingPanels";

describe("AccountingAdministrationPanel role assignment", () => {
  afterEach(() => { cleanup(); mocks.assignRole.mockClear(); mocks.createCostCenter.mockClear(); mocks.updateCostCenter.mockClear(); mocks.updatePaymentAccount.mockClear(); mocks.createInternalUser.mockClear(); mocks.updateInternalUser.mockClear(); mocks.resetInternalUserPassword.mockClear(); mocks.updateCompanyBranding.mockClear(); mocks.updateCompanyCountry.mockClear(); mocks.configuration.paymentAccounts = []; mocks.configuration.companyBranding = { brandName: null, brandLogoUrl: null, brandLogoKey: null, showProductName: true, countryCode: "IQ" }; });

  it("lists a custom role in the real assignment form and submits it for the selected employee", () => {
    render(<AccountingAdministrationPanel />);
    expect(screen.getAllByRole("option", { name: "مشرف مخزون مخصص" }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("المستخدم"), { target: { value: "11" } });
    fireEvent.change(screen.getAllByLabelText("الدور")[1]!, { target: { value: "93" } });
    fireEvent.change(screen.getAllByLabelText("تقييد بفرع (اختياري)")[1]!, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "تعيين الدور" }));
    expect(mocks.assignRole).toHaveBeenCalledWith({ targetUserId: 11, roleId: 93, branchId: 1 });
  });

  it("creates a cost center from the financial administration form", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.change(screen.getByLabelText("رمز المركز"), { target: { value: "OPS" } });
    fireEvent.change(screen.getByLabelText("اسم المركز"), { target: { value: "العمليات" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة مركز" }));
    expect(mocks.createCostCenter).toHaveBeenCalledWith({ code: "OPS", name: "العمليات" });
  });

  it("creates an internal user with a selected accounting role without rendering the password elsewhere", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.change(screen.getByLabelText("اسم المستخدم الظاهر"), { target: { value: "المحاسب الأول" } });
    fireEvent.change(screen.getByLabelText("اسم الدخول"), { target: { value: "accountant.1" } });
    fireEvent.change(screen.getByLabelText("كلمة المرور المؤقتة"), { target: { value: "A-strong-password-2026" } });
    fireEvent.change(screen.getAllByLabelText("الدور")[0]!, { target: { value: "93" } });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء حساب المستخدم" }));
    expect(mocks.createInternalUser).toHaveBeenCalledWith({ name: "المحاسب الأول", username: "accountant.1", password: "A-strong-password-2026", roleId: 93, branchId: undefined });
    expect(screen.queryByText("A-strong-password-2026")).toBeNull();
  });

  it("lets an authorized administrator reset an internal password without exposing the stored value", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط كلمة المرور" }));
    fireEvent.change(screen.getByLabelText("كلمة مرور جديدة للمستخدم accountant.1"), { target: { value: "New-strong-password-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور" }));
    expect(mocks.resetInternalUserPassword).toHaveBeenCalledWith({ targetUserId: 12, password: "New-strong-password-2026" });
    expect(screen.queryByText("New-strong-password-2026")).toBeNull();
  });

  it("lets a manager deactivate an active cost center from the administration list", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "إيقاف" }));
    expect(mocks.updateCostCenter).toHaveBeenCalledWith({ costCenterId: 17, name: "العمليات", isActive: false });
  });

  it("renames a cost center and renders the saved name after success", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة تسمية" }));
    fireEvent.change(screen.getByLabelText("اسم مركز OPS"), { target: { value: "عمليات تشغيلية" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ الاسم" }));
    expect(mocks.updateCostCenter).toHaveBeenCalledWith({ costCenterId: 17, name: "عمليات تشغيلية", isActive: true });
    expect(screen.getByText("OPS — عمليات تشغيلية")).toBeTruthy();
  });

  it("lets a manager deactivate a cash payment account", () => {
    mocks.configuration.paymentAccounts = [{ id: 21, name: "صندوق المبيعات", type: "cash", currencyCode: "USD", branchId: 1, isActive: true }];
    render(<AccountingAdministrationPanel />);
    fireEvent.click(screen.getByRole("button", { name: "إيقاف حساب صندوق المبيعات" }));
    expect(mocks.updatePaymentAccount).toHaveBeenCalledWith({ paymentAccountId: 21, isActive: false });
  });

  it("renders one currency option when configuration contains a repeated code", () => {
    render(<AccountingAdministrationPanel />);
    const paymentCurrency = screen.getByLabelText("العملة") as HTMLSelectElement;
    expect(Array.from(paymentCurrency.options).filter(option => option.value === "USD")).toHaveLength(1);
  });

  it("shows fiscal-close blockers and disables the close action until the period is ready", () => {
    render(<AccountingAdministrationPanel />);
    expect(screen.getByText("مستند غير مرحل: 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "أكمل المتطلبات قبل الإقفال" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lets the system administrator save the company name first and hide the product name beneath it", () => {
    mocks.configuration.companyBranding = { brandName: "شركة سابقة", brandLogoUrl: null, brandLogoKey: null, showProductName: true, countryCode: "IQ" };
    render(<AccountingAdministrationPanel />);
    fireEvent.change(screen.getByLabelText("اسم الشركة الظاهر"), { target: { value: "شركة النور التجارية" } });
    fireEvent.click(screen.getByLabelText("إظهار اسم الذهبي للمحاسبة"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ هوية الشركة" }));
    expect(mocks.updateCompanyBranding).toHaveBeenCalledWith({ brandName: "شركة النور التجارية", brandLogoUrl: null, brandLogoKey: null, showProductName: false });
  });

  it("lets the system administrator select Syria as the company country profile", () => {
    render(<AccountingAdministrationPanel />);
    fireEvent.change(screen.getByLabelText("الدولة المستهدفة"), { target: { value: "SY" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ ملف الدولة" }));
    expect(mocks.updateCompanyCountry).toHaveBeenCalledWith({ countryCode: "SY" });
  });
});
