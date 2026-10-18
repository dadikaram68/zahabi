import { describe, expect, it } from "vitest";
import { getAccountingUiAccess, getEnabledAccountingQueries } from "../shared/accountingAccess";

describe("accounting workspace access", () => {
  it("limits a warehouse keeper to documents and transfer-capable creation", () => {
    const access = getAccountingUiAccess(["warehouse_keeper"], false);
    expect(access.canCreateDocument).toBe(true);
    expect(access.canSubmitDocument).toBe(true);
    expect(access.canViewFinance).toBe(false);
    expect(access.allowedTabs).toEqual(["overview", "documents"]);
    expect(access.allowedDocumentTypes).toEqual(["stockTransfer"]);
    expect(getEnabledAccountingQueries(true, access)).toMatchObject({ accounts: false, journals: false, approvals: false, employees: false, paymentAccounts: true, warehouses: true, inventory: true, partners: true });
  });

  it("allows a finance manager to see the controlled financial workspace", () => {
    const access = getAccountingUiAccess(["finance_manager"], true);
    expect(access.canApproveDocument).toBe(true);
    expect(access.allowedTabs).toEqual(["overview", "documents", "dailyEntries", "accounts", "journals", "reports", "approvals", "payroll", "fixedAssets", "administration"]);
    expect(access.allowedDocumentTypes).toContain("saleInvoice");
    expect(getEnabledAccountingQueries(true, access)).toEqual({ overview: true, documents: true, accounts: true, journals: true, approvals: true, employees: true, paymentAccounts: true, warehouses: true, inventory: true, partners: true });
  });

  it("uses delegated permissions to expose only a stock transfer to a custom operational role", () => {
    const access = getAccountingUiAccess([], false, ["documents.create"]);
    expect(access.canCreateDocument).toBe(true);
    expect(access.canViewFinance).toBe(false);
    expect(access.allowedDocumentTypes).toEqual(["stockTransfer"]);
    expect(access.allowedTabs).toEqual(["overview", "documents"]);
  });

  it("inherits financial read access for a custom manager role", () => {
    const access = getAccountingUiAccess([], true, ["accounting.manage"]);
    expect(access.canViewFinance).toBe(true);
    expect(access.allowedTabs).toContain("accounts");
    expect(access.allowedTabs).toContain("reports");
  });

  it("grants cash approval only to managers or delegated approvers", () => {
    expect(getAccountingUiAccess(["accountant"], false).canApproveCash).toBe(false);
    expect(getAccountingUiAccess(["finance_manager"], true).canApproveCash).toBe(true);
    expect(getAccountingUiAccess([], false, ["accounting.cash.approve"]).canApproveCash).toBe(true);
  });
});
