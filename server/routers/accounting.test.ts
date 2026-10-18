import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const accountingMocks = vi.hoisted(() => ({
  ensureAccountingSetup: vi.fn(),
  getAccountingOverview: vi.fn(),
  listAccountingAccounts: vi.fn(),
  listAccountingDocuments: vi.fn(),
  listSettlementTargets: vi.fn(),
  listReturnableSalesLines: vi.fn(),
  listApprovals: vi.fn(),
  listActivePaymentAccounts: vi.fn(),
  listActivePriceLists: vi.fn(),
  listActiveCostCenters: vi.fn(),
  listActiveAccountingWarehouses: vi.fn(),
  listEmployees: vi.fn(),
  listJournalEntries: vi.fn(),
  createAccountingDocument: vi.fn(),
  updateAccountingDocumentDraft: vi.fn(),
  createCostCenter: vi.fn(),
  updateCostCenter: vi.fn(),
  submitDocumentForApproval: vi.fn(),
  cancelAccountingDocument: vi.fn(),
  approveAndPostDocument: vi.fn(),
  createPayrollRun: vi.fn(),
  listPayrollRunDetails: vi.fn(),
  submitPayrollForApproval: vi.fn(),
  approveAndPostPayroll: vi.fn(),
  listAttendanceForReview: vi.fn(),
  submitAttendanceForApproval: vi.fn(),
  approveAttendance: vi.fn(),
  getAccountingRoleCodes: vi.fn(),
  getFinancialReports: vi.fn(),
  calculateManualTax: vi.fn(),
  getBudgetComparison: vi.fn(),
  upsertAccountingBudget: vi.fn(),
  listFixedAssets: vi.fn(),
  createFixedAsset: vi.fn(),
  postFixedAssetDepreciation: vi.fn(),
  closeCurrentFiscalPeriod: vi.fn(),
  recordAttendance: vi.fn(),
  createAccountingEmployee: vi.fn(),
  createInternalUserAccount: vi.fn(),
  updateInternalUserAccount: vi.fn(),
  resetInternalUserPassword: vi.fn(),
  getAccountingAccessConfiguration: vi.fn(),
  updatePaymentAccount: vi.fn(),
  getAccountingPermissions: vi.fn(),
  createCustomAccountingRole: vi.fn(),
  updateAccountingRolePermissions: vi.fn(),
  assignAccountingRole: vi.fn(),
  getPublicCompanyBranding: vi.fn(),
  updateCompanyBranding: vi.fn(),
  updateCompanyCountry: vi.fn(),
  getOrCreateDailyExchangeRate: vi.fn(),
  saveDailyExchangeRate: vi.fn(),
  getCashPeriodReport: vi.fn(),
  submitDailyEntryForApproval: vi.fn(),
  approveDailyEntry: vi.fn(),
}));

vi.mock("../accountingDb", () => accountingMocks);

import { accountingRouter } from "./accounting";

function context(role: "admin" | "user", userId = 7): TrpcContext {
  return {
    user: { id: userId, openId: `accounting-test-${userId}`, name: "Test", email: null, loginMethod: null, role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("accounting router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accountingMocks.getAccountingRoleCodes.mockResolvedValue([]);
    accountingMocks.getAccountingPermissions.mockResolvedValue([]);
    accountingMocks.getOrCreateDailyExchangeRate.mockImplementation(async ({ currencyCode, marketExchangeRate }: { currencyCode: string; marketExchangeRate?: number }) => ({
      currencyCode,
      marketExchangeRate: marketExchangeRate ?? (currencyCode === "USD" ? 1 : 1570),
      exchangeRatePpm: currencyCode === "USD" ? 1_000_000 : 637,
      rateDate: "2026-10-04",
    }));
  });
  it("allows an administrator to create a controlled accounting document", async () => {
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 31, documentNumber: "SAL-1-000001", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    const result = await caller.createDocument({ type: "saleInvoice", currencyCode: "IQD", exchangeRatePpm: 1_000_000, lines: [{ description: "صنف تجريبي", quantity: 2, unitPriceMinor: 15_000 }] });
    expect(result).toEqual({ id: 31, documentNumber: "SAL-1-000001", status: "draft" });
    expect(accountingMocks.createAccountingDocument).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, type: "saleInvoice", currencyCode: "IQD" }));
  });

  it("rejects a document line with no quantity before it reaches the database", async () => {
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.createDocument({ type: "saleInvoice", currencyCode: "IQD", exchangeRatePpm: 1_000_000, lines: [{ description: "غير صالح", quantity: 0, unitPriceMinor: 100 }] })).rejects.toThrow();
    expect(accountingMocks.createAccountingDocument).not.toHaveBeenCalledWith(expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ quantity: 0 })]) }));
  });

  it("forwards several priced and discounted lines to the accounting engine", async () => {
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 33, documentNumber: "PUR-1-000001", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    await caller.createDocument({ type: "purchaseInvoice", currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [
      { description: "البند الأول", quantity: 2, unitPriceMinor: 500, discountMinor: 50 },
      { description: "البند الثاني", quantity: 1, unitPriceMinor: 750, discountMinor: 0 },
    ] });
    expect(accountingMocks.createAccountingDocument).toHaveBeenCalledWith(expect.objectContaining({
      currencyCode: "USD",
      lines: [
        expect.objectContaining({ description: "البند الأول", quantity: 2, unitPriceMinor: 500, discountMinor: 50 }),
        expect.objectContaining({ description: "البند الثاني", quantity: 1, unitPriceMinor: 750, discountMinor: 0 }),
      ],
    }));
  });

  it("forwards an optional cost center with the accounting document", async () => {
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 34, documentNumber: "SAL-1-000003", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.createDocument({ type: "saleInvoice", costCenterId: 12, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "خدمة مركز عمليات", quantity: 1, unitPriceMinor: 1_000 }] })).resolves.toMatchObject({ id: 34 });
    expect(accountingMocks.createAccountingDocument).toHaveBeenCalledWith(expect.objectContaining({ costCenterId: 12, userId: 7 }));
  });

  it("forwards the selected payment account with a receipt document", async () => {
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 34, documentNumber: "REC-1-000001", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    await caller.createDocument({ type: "receipt", paymentAccountId: 5, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "تحصيل ذمة", quantity: 1, unitPriceMinor: 1_200, discountMinor: 0 }] });
    expect(accountingMocks.createAccountingDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "receipt", paymentAccountId: 5, currencyCode: "USD" }));
  });

  it("requests a cash period report with the selected currency and account", async () => {
    accountingMocks.getCashPeriodReport.mockResolvedValue({
      fromDate: "2026-10-01",
      toDate: "2026-10-08",
      currencyCode: "USD",
      totals: { openingMinor: 0, openingBaseMinor: 0, receiptMinor: 500, spentMinor: 125, closingMinor: 375, closingBaseMinor: 375 },
      accounts: [],
      daily: [],
      entries: [],
    });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.cashPeriodReport({ fromDate: "2026-10-01", toDate: "2026-10-08", paymentAccountId: 5, currencyCode: "USD" })).resolves.toMatchObject({ currencyCode: "USD", totals: { closingMinor: 375 } });
    expect(accountingMocks.getCashPeriodReport).toHaveBeenCalledWith({ userId: 7, fromDate: "2026-10-01", toDate: "2026-10-08", paymentAccountId: 5, currencyCode: "USD" });
  });

  it("returns only the applicable open settlement targets to a permitted cashier", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["cashier"]);
    accountingMocks.listSettlementTargets.mockResolvedValue([{ id: 41, documentNumber: "SAL-1-000041", partnerId: 5, partnerName: "عميل", currencyCode: "USD", totalMinor: 1_000, outstandingMinor: 400 }]);
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.settlementTargets({ type: "receipt" })).resolves.toMatchObject([{ id: 41, outstandingMinor: 400 }]);
    expect(accountingMocks.listSettlementTargets).toHaveBeenCalledWith(7, "receipt");
  });

  it("routes draft cancellation with the requesting creator identity", async () => {
    accountingMocks.cancelAccountingDocument.mockResolvedValue({ status: "cancelled" });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.cancelDocument({ documentId: 55 })).resolves.toEqual({ status: "cancelled" });
    expect(accountingMocks.cancelAccountingDocument).toHaveBeenCalledWith({ documentId: 55, userId: 7 });
  });

  it("routes a draft amendment with the creator identity while retaining document-type validation", async () => {
    accountingMocks.updateAccountingDocumentDraft.mockResolvedValue({ id: 55, documentNumber: "SAL-1-000055", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.updateDocumentDraft({ documentId: 55, currencyCode: "USD", exchangeRatePpm: 1_000_000, note: "تعديل الكمية", lines: [{ description: "خدمة محدثة", quantity: 2, unitPriceMinor: 700, discountMinor: 0 }] })).resolves.toMatchObject({ id: 55, status: "draft" });
    expect(accountingMocks.updateAccountingDocumentDraft).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, documentId: 55, note: "تعديل الكمية", lines: [expect.objectContaining({ quantity: 2, unitPriceMinor: 700 })] }));
  });

  it("creates a cost center through the financial-administration permission boundary", async () => {
    accountingMocks.createCostCenter.mockResolvedValue({ id: 12, code: "OPS" });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.createCostCenter({ code: "OPS", name: "العمليات" })).resolves.toEqual({ id: 12, code: "OPS" });
    expect(accountingMocks.createCostCenter).toHaveBeenCalledWith({ code: "OPS", name: "العمليات", userId: 7 });
  });

  it("returns active cost centers to an authorized accounting reader", async () => {
    accountingMocks.listActiveCostCenters.mockResolvedValue([{ id: 3, code: "OPS", name: "العمليات", isActive: true }]);
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.costCenters()).resolves.toEqual([{ id: 3, code: "OPS", name: "العمليات", isActive: true }]);
    expect(accountingMocks.listActiveCostCenters).toHaveBeenCalledWith(7);
  });

  it("updates the active state of a cost center through the management boundary", async () => {
    accountingMocks.updateCostCenter.mockResolvedValue({ id: 3, name: "العمليات", isActive: false });
    const caller = accountingRouter.createCaller(context("admin"));
    await expect(caller.updateCostCenter({ costCenterId: 3, name: "العمليات", isActive: false })).resolves.toEqual({ id: 3, name: "العمليات", isActive: false });
    expect(accountingMocks.updateCostCenter).toHaveBeenCalledWith({ costCenterId: 3, name: "العمليات", isActive: false, userId: 7 });
  });

  it("prevents a standard user from approving a financial document", async () => {
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.approveDocument({ documentId: 31 })).rejects.toThrow("لا تملك صلاحية محاسبية");
    expect(accountingMocks.getAccountingRoleCodes).toHaveBeenCalledWith(7);
  });

  it("allows the finance manager to close an already balanced fiscal period", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.closeCurrentFiscalPeriod.mockResolvedValue({ id: 4, status: "closed" });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.closePeriod()).resolves.toEqual({ id: 4, status: "closed" });
    expect(accountingMocks.closeCurrentFiscalPeriod).toHaveBeenCalledWith(7);
  });

  it("allows the HR manager to retrieve payroll runs and employee lines", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.listPayrollRunDetails.mockResolvedValue({ runs: [{ id: 5, name: "رواتب آب", status: "draft" }], lines: [{ payrollRunId: 5, employeeId: 8, employeeName: "موظف", grossMinor: 1_000, advanceMinor: 0, deductionMinor: 0, netMinor: 1_000 }] });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.payrollDetails()).resolves.toMatchObject({ runs: [{ id: 5 }], lines: [expect.objectContaining({ payrollRunId: 5, netMinor: 1_000 })] });
    expect(accountingMocks.listPayrollRunDetails).toHaveBeenCalledWith(7);
  });

  it("routes payroll submission to HR and approval to the finance manager", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.submitPayrollForApproval.mockResolvedValue({ status: "pendingApproval" });
    const hrCaller = accountingRouter.createCaller(context("user"));
    await expect(hrCaller.submitPayroll({ payrollRunId: 5 })).resolves.toEqual({ status: "pendingApproval" });
    expect(accountingMocks.submitPayrollForApproval).toHaveBeenCalledWith(5, 7);

    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.approveAndPostPayroll.mockResolvedValue({ journalEntryId: 9, status: "posted" });
    const financeCaller = accountingRouter.createCaller(context("user"));
    await expect(financeCaller.approvePayroll({ payrollRunId: 5 })).resolves.toEqual({ journalEntryId: 9, status: "posted" });
    expect(accountingMocks.approveAndPostPayroll).toHaveBeenCalledWith(5, 7);
  });

  it("passes a selected payroll period to the payroll engine", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.createPayrollRun.mockResolvedValue({ id: 9, employeeCount: 2 });
    const caller = accountingRouter.createCaller(context("user"));
    const periodStart = new Date("2026-08-01T00:00:00.000Z");
    const periodEnd = new Date("2026-08-31T23:59:59.999Z");
    await expect(caller.createPayroll({ name: "رواتب آب", periodStart, periodEnd })).resolves.toEqual({ id: 9, employeeCount: 2 });
    expect(accountingMocks.createPayrollRun).toHaveBeenCalledWith({ userId: 7, name: "رواتب آب", periodStart, periodEnd });
  });

  it("returns USD as the declared base currency for financial reports", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.getFinancialReports.mockResolvedValue({ baseCurrencyCode: "USD", trialBalance: [], incomeStatement: { revenue: 0, expenses: 0, netProfit: 0 }, balanceSheet: { assets: 0, liabilities: 0, equity: 0, currentPeriodEarnings: 0, liabilitiesAndEquity: 0 }, generalLedger: [], aging: [], totals: { totalDebits: 0, totalCredits: 0, balanced: true } });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.reports()).resolves.toMatchObject({ baseCurrencyCode: "USD", balanceSheet: { liabilitiesAndEquity: 0 }, generalLedger: [], totals: { balanced: true } });
    expect(accountingMocks.getFinancialReports).toHaveBeenCalledWith({ userId: 7 });
  });

  it("allows an accountant to request a manual tax calculation for a selected period", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["accountant"]);
    accountingMocks.calculateManualTax.mockResolvedValue({ basis: "operational", rateBps: 1250, documentCount: 2, rows: [], currencySummaries: [], outputTaxUsdMinor: 125, inputTaxUsdMinor: 25, netTaxPayableUsdMinor: 100 });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.calculateManualTax({ rateBps: 1250, startDate: "2026-08-01", endDate: "2026-08-31" })).resolves.toMatchObject({ rateBps: 1250, documentCount: 2 });
    expect(accountingMocks.calculateManualTax).toHaveBeenCalledWith({ userId: 7, rateBps: 1250, startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("allows accounting readers to view a budget comparison but only a finance manager to update a budget line", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["accountant"]);
    accountingMocks.getBudgetComparison.mockResolvedValue({ fiscalPeriodId: 1, fiscalPeriodName: "2026", rows: [] });
    const reader = accountingRouter.createCaller(context("user"));
    await expect(reader.budgets()).resolves.toMatchObject({ fiscalPeriodId: 1 });
    await expect(reader.upsertBudget({ accountId: 12, budgetMinor: 10_000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.upsertAccountingBudget.mockResolvedValue({ accountId: 12, budgetMinor: 10_000 });
    const manager = accountingRouter.createCaller(context("user"));
    await expect(manager.upsertBudget({ accountId: 12, budgetMinor: 10_000 })).resolves.toEqual({ accountId: 12, budgetMinor: 10_000 });
    expect(accountingMocks.upsertAccountingBudget).toHaveBeenCalledWith({ userId: 7, accountId: 12, budgetMinor: 10_000 });
  });

  it("lets an accounting reader view the fixed-asset register without gaining posting rights", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["accountant"]);
    accountingMocks.listFixedAssets.mockResolvedValue({ assets: [{ id: 5, assetNumber: "AST-5", status: "active" }], depreciation: [] });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.fixedAssets()).resolves.toMatchObject({ assets: [{ id: 5, assetNumber: "AST-5" }] });
    await expect(caller.postFixedAssetDepreciation({ assetId: 5, periodKey: "2026-09" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(accountingMocks.listFixedAssets).toHaveBeenCalledWith(7);
  });

  it("routes fixed-asset capitalization and monthly depreciation through the finance-manager boundary", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.createFixedAsset.mockResolvedValue({ id: 55, assetNumber: "AST-55", journalEntryId: 900, status: "active" });
    accountingMocks.postFixedAssetDepreciation.mockResolvedValue({ assetId: 55, periodKey: "2026-09", depreciationMinor: 10_000, journalEntryId: 901, status: "active" });
    const caller = accountingRouter.createCaller(context("user"));
    const acquiredAt = new Date("2026-08-01T00:00:00.000Z");
    await expect(caller.createFixedAsset({ assetNumber: "AST-55", name: "حاسوب محمول", acquiredAt, acquisitionMinor: 120_000, salvageMinor: 0, usefulLifeMonths: 12, branchId: 1, assetAccountId: 13, accumulatedDepreciationAccountId: 14, depreciationExpenseAccountId: 15, creditAccountId: 11 })).resolves.toMatchObject({ id: 55, journalEntryId: 900 });
    await expect(caller.postFixedAssetDepreciation({ assetId: 55, periodKey: "2026-09" })).resolves.toMatchObject({ depreciationMinor: 10_000, journalEntryId: 901 });
    expect(accountingMocks.createFixedAsset).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, assetNumber: "AST-55", acquiredAt }));
    expect(accountingMocks.postFixedAssetDepreciation).toHaveBeenCalledWith({ userId: 7, assetId: 55, periodKey: "2026-09" });
  });

  it("allows a cashier to read active payment accounts for settlement documents", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["cashier"]);
    accountingMocks.listActivePaymentAccounts.mockResolvedValue([{ id: 5, name: "صندوق الفرع", type: "cash", currencyCode: "USD", branchId: 1 }]);
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.paymentAccounts()).resolves.toEqual([{ id: 5, name: "صندوق الفرع", type: "cash", currencyCode: "USD", branchId: 1 }]);
    expect(accountingMocks.listActivePaymentAccounts).toHaveBeenCalledWith(7);
  });

  it("allows the finance manager to deactivate a payment account", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.updatePaymentAccount.mockResolvedValue({ id: 9, isActive: false });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.updatePaymentAccount({ paymentAccountId: 9, isActive: false })).resolves.toEqual({ id: 9, isActive: false });
    expect(accountingMocks.updatePaymentAccount).toHaveBeenCalledWith({ userId: 7, paymentAccountId: 9, isActive: false });
  });

  it("returns active price lists to a permitted document creator", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["accountant"]);
    accountingMocks.listActivePriceLists.mockResolvedValue([{ id: 6, code: "RETAIL", name: "مفرد", currencyCode: "USD", maxDiscountBps: 500 }]);
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.priceLists()).resolves.toEqual([{ id: 6, code: "RETAIL", name: "مفرد", currencyCode: "USD", maxDiscountBps: 500 }]);
    expect(accountingMocks.listActivePriceLists).toHaveBeenCalledWith(7);
  });

  it("allows a warehouse user to read active warehouses for a transfer", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["warehouse_keeper"]);
    accountingMocks.listActiveAccountingWarehouses.mockResolvedValue([{ id: 8, branchId: 2, branchName: "فرع الشمال", code: "N-WH", name: "مخزن الشمال" }]);
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.warehouses()).resolves.toEqual([{ id: 8, branchId: 2, branchName: "فرع الشمال", code: "N-WH", name: "مخزن الشمال" }]);
    expect(accountingMocks.listActiveAccountingWarehouses).toHaveBeenCalledWith(7);
  });

  it("exposes accounting workspace access to a warehouse keeper without management rights", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["warehouse_keeper"]);
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.access()).resolves.toEqual({ canAccess: true, canManage: false, canManagePermissions: false, roles: ["warehouse_keeper"], permissions: [] });
  });

  it("forwards the destination warehouse and selected variant for a stock transfer", async () => {
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 35, documentNumber: "STO-1-000001", status: "draft" });
    const caller = accountingRouter.createCaller(context("admin"));
    await caller.createDocument({ type: "stockTransfer", warehouseId: 3, destinationWarehouseId: 8, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId: 14, description: "تحويل كابلات", quantity: 3, unitPriceMinor: 0, discountMinor: 0 }] });
    expect(accountingMocks.createAccountingDocument).toHaveBeenCalledWith(expect.objectContaining({ type: "stockTransfer", warehouseId: 3, destinationWarehouseId: 8, lines: [expect.objectContaining({ variantId: 14, quantity: 3 })] }));
  });

  it("lets a warehouse keeper create a stock transfer but not a sales invoice", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["warehouse_keeper"]);
    accountingMocks.createAccountingDocument.mockResolvedValue({ id: 36, documentNumber: "STO-1-000002", status: "draft" });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.createDocument({ type: "stockTransfer", destinationWarehouseId: 8, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId: 14, description: "تحويل", quantity: 1, unitPriceMinor: 0 }] })).resolves.toMatchObject({ id: 36 });
    await expect(caller.createDocument({ type: "saleInvoice", currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "غير مسموح", quantity: 1, unitPriceMinor: 100 }] })).rejects.toThrow("إنشاء مستند مالي");
  });

  it("allows a warehouse keeper to submit the transfer they created for manager approval", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["warehouse_keeper"]);
    accountingMocks.submitDocumentForApproval.mockResolvedValue({ status: "pendingApproval" });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.submitDocument({ documentId: 36 })).resolves.toEqual({ status: "pendingApproval" });
    expect(accountingMocks.submitDocumentForApproval).toHaveBeenCalledWith(36, 7);
  });

  it("allows HR to record validated employee attendance", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.recordAttendance.mockResolvedValue({ id: 12 });
    const caller = accountingRouter.createCaller(context("user"));
    const workDate = new Date("2026-08-24T00:00:00.000Z");
    await expect(caller.recordAttendance({ employeeId: 3, workDate, status: "present", overtimeMinutes: 30 })).resolves.toEqual({ id: 12 });
    expect(accountingMocks.recordAttendance).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, employeeId: 3, overtimeMinutes: 30 }));
  });

  it("allows HR to create an employee with a salary currency and explicit USD conversion", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.createAccountingEmployee.mockResolvedValue({ id: 23, monthlySalaryMinor: 1_140 });
    const caller = accountingRouter.createCaller(context("user"));
    await expect(caller.createEmployee({ fullName: "سارة محمود", employeeNumber: "EMP-23", salaryAmount: 1_500_000, salaryCurrencyCode: "iqd", salaryExchangeRate: 0.00076 })).resolves.toEqual({ id: 23, monthlySalaryMinor: 1_140 });
    expect(accountingMocks.createAccountingEmployee).toHaveBeenCalledWith({ userId: 7, fullName: "سارة محمود", employeeNumber: "EMP-23", salaryAmount: 1_500_000, salaryCurrencyCode: "IQD", salaryExchangeRate: 0.00076 });
  });

  it("routes attendance review through HR submission and finance approval boundaries", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["hr_manager"]);
    accountingMocks.listAttendanceForReview.mockResolvedValue([{ id: 17, employeeName: "موظف", approvalStatus: "draft" }]);
    accountingMocks.submitAttendanceForApproval.mockResolvedValue({ approvalStatus: "pendingApproval" });
    const hrCaller = accountingRouter.createCaller(context("user"));
    await expect(hrCaller.attendance()).resolves.toEqual([{ id: 17, employeeName: "موظف", approvalStatus: "draft" }]);
    await expect(hrCaller.submitAttendance({ attendanceId: 17 })).resolves.toEqual({ approvalStatus: "pendingApproval" });
    await expect(hrCaller.approveAttendance({ attendanceId: 17 })).rejects.toThrow("لا تملك صلاحية محاسبية");
    expect(accountingMocks.listAttendanceForReview).toHaveBeenCalledWith(7);
    expect(accountingMocks.submitAttendanceForApproval).toHaveBeenCalledWith({ userId: 7, attendanceId: 17 });

    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.approveAttendance.mockResolvedValue({ approvalStatus: "approved" });
    const financeCaller = accountingRouter.createCaller(context("user"));
    await expect(financeCaller.approveAttendance({ attendanceId: 17 })).resolves.toEqual({ approvalStatus: "approved" });
    expect(accountingMocks.approveAttendance).toHaveBeenCalledWith({ userId: 7, attendanceId: 17 });
  });

  it("exposes delegated access and lets the owner create a custom role", async () => {
    accountingMocks.getAccountingPermissions.mockResolvedValue(["accounting.read"]);
    const staff = accountingRouter.createCaller(context("user"));
    await expect(staff.access()).resolves.toMatchObject({ canAccess: true, permissions: ["accounting.read"] });
    accountingMocks.createCustomAccountingRole.mockResolvedValue({ id: 91 });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.createCustomRole({ name: "مشرف تقارير", permissions: ["accounting.read"] })).resolves.toEqual({ id: 91 });
    expect(accountingMocks.createCustomAccountingRole).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, isOwner: true, permissions: ["accounting.read"] }));
  });

  it("allows a manager to change roles only after an explicit owner-granted permission", async () => {
    accountingMocks.getAccountingPermissions.mockResolvedValue(["permissions.manage"]);
    accountingMocks.createCustomAccountingRole.mockResolvedValue({ id: 92 });
    const delegatedManager = accountingRouter.createCaller(context("user"));
    await expect(delegatedManager.createCustomRole({ name: "مشرف مخزون", permissions: ["documents.create"] })).resolves.toEqual({ id: 92 });
    expect(accountingMocks.createCustomAccountingRole).toHaveBeenCalledWith(expect.objectContaining({ isOwner: false, permissions: ["documents.create"] }));
  });

  it("gives a delegated permission manager only the scoped access-configuration query, not financial configuration", async () => {
    accountingMocks.getAccountingPermissions.mockResolvedValue(["permissions.manage"]);
    accountingMocks.getAccountingAccessConfiguration.mockResolvedValue({ branches: [], roles: [], users: [], assignments: [], rolePermissions: [] });
    const delegatedManager = accountingRouter.createCaller(context("user"));
    await expect(delegatedManager.accessConfiguration()).resolves.toEqual({ branches: [], roles: [], users: [], assignments: [], rolePermissions: [] });
    await expect(delegatedManager.configuration()).rejects.toThrow("لا تملك صلاحية محاسبية");
    expect(accountingMocks.getAccountingAccessConfiguration).toHaveBeenCalledWith(7);
  });

  it("lets the owner assign a custom role to an employee after role creation", async () => {
    accountingMocks.assignAccountingRole.mockResolvedValue({ success: true });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.assignRole({ targetUserId: 11, roleId: 92, branchId: 2 })).resolves.toEqual({ success: true });
    expect(accountingMocks.assignAccountingRole).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, targetUserId: 11, roleId: 92, branchId: 2, isOwner: true }));
  });

  it("lets the owner create an internal user account with an assigned role", async () => {
    accountingMocks.createInternalUserAccount.mockResolvedValue({ id: 33, username: "accountant.1" });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.createInternalUser({ name: "المحاسب الأول", username: "accountant.1", password: "A-strong-password-2026", roleId: 41, branchId: 1 })).resolves.toEqual({ id: 33, username: "accountant.1" });
    expect(accountingMocks.createInternalUserAccount).toHaveBeenCalledWith({ userId: 7, isOwner: true, canGrantSystemAdmin: true, name: "المحاسب الأول", username: "accountant.1", password: "A-strong-password-2026", roleId: 41, branchId: 1 });
  });

  it("lets the owner reset an internal password without reading the prior password", async () => {
    accountingMocks.resetInternalUserPassword.mockResolvedValue({ id: 33, passwordReset: true });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.resetInternalUserPassword({ targetUserId: 33, password: "New-strong-password-2026" })).resolves.toEqual({ id: 33, passwordReset: true });
    expect(accountingMocks.resetInternalUserPassword).toHaveBeenCalledWith({ userId: 7, targetUserId: 33, password: "New-strong-password-2026" });
  });

  it("supports the full custom-role contract from permissions to an assigned employee's resulting access", async () => {
    accountingMocks.createCustomAccountingRole.mockResolvedValue({ id: 93 });
    accountingMocks.updateAccountingRolePermissions.mockResolvedValue({ success: true });
    accountingMocks.assignAccountingRole.mockResolvedValue({ success: true });
    const owner = accountingRouter.createCaller(context("admin"));

    await expect(owner.createCustomRole({ name: "مشرف مخزون مخصص", permissions: ["inventory.read"] })).resolves.toEqual({ id: 93 });
    await expect(owner.updateRolePermissions({ roleId: 93, permissions: ["inventory.read", "accounting.read"] })).resolves.toEqual({ success: true });
    await expect(owner.assignRole({ targetUserId: 11, roleId: 93, branchId: 2 })).resolves.toEqual({ success: true });

    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["custom_inventory_supervisor"]);
    accountingMocks.getAccountingPermissions.mockResolvedValue(["inventory.read", "accounting.read"]);
    const assignedEmployee = accountingRouter.createCaller(context("user", 11));
    await expect(assignedEmployee.access()).resolves.toMatchObject({
      canAccess: true,
      canManage: false,
      canManagePermissions: false,
      roles: ["custom_inventory_supervisor"],
      permissions: ["inventory.read", "accounting.read"],
    });
    expect(accountingMocks.createCustomAccountingRole).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, isOwner: true, permissions: ["inventory.read"] }));
    expect(accountingMocks.updateAccountingRolePermissions).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, roleId: 93, isOwner: true, permissions: ["inventory.read", "accounting.read"] }));
    expect(accountingMocks.assignAccountingRole).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, targetUserId: 11, roleId: 93, branchId: 2, isOwner: true }));
    expect(accountingMocks.getAccountingPermissions).toHaveBeenLastCalledWith(11);
  });

  it("blocks a finance manager without the explicit permission grant from all role-management actions", async () => {
    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    accountingMocks.getAccountingPermissions.mockResolvedValue([]);
    const financeManager = accountingRouter.createCaller(context("user"));
    await expect(financeManager.assignRole({ targetUserId: 8, roleId: 3 })).rejects.toThrow("صلاحية محاسبية");
    await expect(financeManager.createCustomRole({ name: "مشرف تقارير", permissions: ["accounting.read"] })).rejects.toThrow("صلاحية محاسبية");
    await expect(financeManager.updateRolePermissions({ roleId: 3, permissions: ["accounting.read"] })).rejects.toThrow("صلاحية محاسبية");
  });

  it("exposes company branding publicly but limits branding changes to the system administrator", async () => {
    accountingMocks.getPublicCompanyBranding.mockResolvedValue({ brandName: "شركة النور", brandLogoUrl: "/manus-storage/logo.png", showProductName: false });
    const publicCaller = accountingRouter.createCaller(context("user"));
    await expect(publicCaller.publicBranding()).resolves.toEqual({ brandName: "شركة النور", brandLogoUrl: "/manus-storage/logo.png", showProductName: false });

    accountingMocks.updateCompanyBranding.mockResolvedValue({ brandName: "شركة النور", brandLogoUrl: null, brandLogoKey: null, showProductName: false });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.updateCompanyBranding({ brandName: "شركة النور", brandLogoUrl: null, brandLogoKey: null, showProductName: false })).resolves.toMatchObject({ brandName: "شركة النور", showProductName: false });
    expect(accountingMocks.updateCompanyBranding).toHaveBeenCalledWith({ userId: 7, brandName: "شركة النور", brandLogoUrl: null, brandLogoKey: null, showProductName: false });

    accountingMocks.getAccountingRoleCodes.mockResolvedValue(["finance_manager"]);
    const financeManager = accountingRouter.createCaller(context("user"));
    await expect(financeManager.updateCompanyBranding({ brandName: "شركة النور", brandLogoUrl: null, brandLogoKey: null, showProductName: true })).rejects.toThrow("لا تملك صلاحية محاسبية");
  });

  it("allows the system administrator to change the company country profile only through the protected procedure", async () => {
    accountingMocks.updateCompanyCountry.mockResolvedValue({ countryCode: "SY" });
    const owner = accountingRouter.createCaller(context("admin"));
    await expect(owner.updateCompanyCountry({ countryCode: "SY" })).resolves.toEqual({ countryCode: "SY" });
    expect(accountingMocks.updateCompanyCountry).toHaveBeenCalledWith({ userId: 7, countryCode: "SY" });
    const user = accountingRouter.createCaller(context("user"));
    await expect(user.updateCompanyCountry({ countryCode: "IQ" })).rejects.toThrow("لا تملك صلاحية محاسبية");
  });
});
