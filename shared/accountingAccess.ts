export type AccountingWorkspaceTab =
  | "overview"
  | "documents"
  | "dailyEntries"
  | "cashMovements"
  | "accounts"
  | "journals"
  | "approvals"
  | "payroll"
  | "reports"
  | "fixedAssets"
  | "administration";
export type AccountingDocumentAction =
  | "saleInvoice"
  | "purchaseInvoice"
  | "salesReturn"
  | "purchaseReturn"
  | "receipt"
  | "payment"
  | "stockTransfer";

export function getAccountingUiAccess(
  roles: string[],
  canManage: boolean,
  permissions: string[] = []
) {
  const has = (...codes: string[]) => roles.some(role => codes.includes(role));
  const allows = (permission: string) => {
    if (
      permissions.includes("*") ||
      permissions.includes(permission) ||
      permissions.includes(`${permission.split(".")[0]}.*`)
    )
      return true;
    const impliedReadPermissions: Record<string, string[]> = {
      "accounting.read": ["accounting.manage"],
      "inventory.read": ["inventory.manage"],
      "commerce.read": ["commerce.manage"],
    };
    return (
      impliedReadPermissions[permission]?.some(code =>
        permissions.includes(code)
      ) ?? false
    );
  };
  const canCreateDocument =
    has(
      "system_admin",
      "finance_manager",
      "accountant",
      "cashier",
      "warehouse_keeper"
    ) || allows("documents.create");
  const canApproveDocument =
    has("system_admin", "finance_manager") || allows("documents.approve");
  const canViewFinance =
    has("system_admin", "finance_manager", "accountant", "cashier") ||
    allows("accounting.read");
  const canManagePayroll =
    has("system_admin", "finance_manager", "hr_manager") ||
    allows("payroll.manage");
  const canCreateFinancialDocument =
    has("system_admin", "finance_manager", "accountant", "cashier") ||
    allows("documents.financial.create");
  const canEditHistorical =
    has("system_admin", "finance_manager") ||
    allows("documents.editHistorical");
  const canCarryCashForward =
    has("system_admin", "finance_manager", "accountant") ||
    allows("accounting.cash.opening");
  const canApproveCash =
    has("system_admin", "finance_manager") || allows("accounting.cash.approve");
  const canSubmitDocument = canCreateDocument;
  const allowedDocumentTypes: AccountingDocumentAction[] =
    canCreateFinancialDocument
      ? [
          "saleInvoice",
          "purchaseInvoice",
          "salesReturn",
          "purchaseReturn",
          "receipt",
          "payment",
          "stockTransfer",
        ]
      : canCreateDocument
        ? ["stockTransfer"]
        : [];
  const allowedTabs: AccountingWorkspaceTab[] = ["overview", "documents"];
  if (canViewFinance) allowedTabs.push("dailyEntries");
  if (canViewFinance) allowedTabs.push("accounts", "journals", "reports");
  if (canApproveDocument) allowedTabs.push("approvals");
  if (canManagePayroll) allowedTabs.push("payroll");
  if (canManage) allowedTabs.push("fixedAssets");
  if (canManage || allows("permissions.manage"))
    allowedTabs.push("administration");
  return {
    canCreateDocument,
    canSubmitDocument,
    canApproveDocument,
    canViewFinance,
    canManagePayroll,
    canEditHistorical,
    canCarryCashForward,
    canApproveCash,
    allowedTabs,
    allowedDocumentTypes,
  };
}

export function getEnabledAccountingQueries(
  canAccess: boolean,
  uiAccess: ReturnType<typeof getAccountingUiAccess>
) {
  return {
    overview: canAccess,
    documents: canAccess,
    accounts: uiAccess.canViewFinance,
    journals: uiAccess.canViewFinance,
    approvals: uiAccess.canApproveDocument,
    employees: uiAccess.canManagePayroll,
    paymentAccounts: uiAccess.canCreateDocument,
    warehouses: uiAccess.canCreateDocument,
    inventory: uiAccess.canCreateDocument,
    partners: uiAccess.canCreateDocument,
  };
}
