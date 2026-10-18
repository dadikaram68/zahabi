import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "../_core/trpc";
import {
  approveAndPostDocument,
  approveAndPostPayroll,
  cancelAccountingDocument,
  createAccountingDocument,
  createPayrollRun,
  listPayrollRunDetails,
  createAccountingBranch,
  createCostCenter,
  updateCostCenter,
  createAccountingEmployee,
  createFixedAsset,
  createInternalUserAccount,
  updateInternalUserAccount,
  updateAccountingDocumentDraft,
  resetInternalUserPassword,
  ensureAccountingSetup,
  getAccountingConfiguration,
  getAccountingDocumentDraftForUpdate,
  getAccountingAccessConfiguration,
  getAccountingPermissionActivityArchivePage,
  getAccountingPermissionActivityPage,
  archiveAccountingPermissionActivity,
  getFinancialReports,
  getBudgetComparison,
  getAccountingOverview,
  listAccountingAccounts,
  listFixedAssets,
  listCheques,
  listAccountingDocuments,
  listSettlementTargets,
  listReturnableSalesLines,
  listReturnablePurchaseLines,
  listActivePaymentAccounts,
  listActivePriceLists,
  calculateManualTax,
  listPriceListItems,
  listActiveAccountingWarehouses,
  listActiveCostCenters,
  listWarehouseVariantBalances,
  listApprovals,
  listEmployees,
  listEmployeeContracts,
  createEmployeeContract,
  listEmployeeLeaves,
  createEmployeeLeave,
  approveEmployeeLeave,
  listJournalEntries,
  listDailyEntries,
  createDailyEntry,
  importDailyEntries,
  postDailyEntry,
  submitDocumentForApproval,
  submitPayrollForApproval,
  assignAccountingRole,
  createCustomAccountingRole,
  closeCurrentFiscalPeriod,
  createPaymentAccount,
  updatePaymentAccount,
  updateCompanyBranding,
  updateCompanyCountry,
  getPublicCompanyBranding,
  getAccountingRoleCodes,
  getAccountingPermissions,
  recordAttendance,
  listAttendanceForReview,
  submitAttendanceForApproval,
  approveAttendance,
  updatePayrollLine,
  updateAccountingRolePermissions,
  updateCustomAccountingRole,
  deleteCustomAccountingRole,
  upsertAccountingBudget,
  upsertPriceListItem,
  upsertPriceListItemTier,
  postFixedAssetDepreciation,
  settleCheque,
  getOrCreateDailyExchangeRate,
  saveDailyExchangeRate,
  getDailyCashSummary,
  getCashPeriodReport,
  listDailyCashReconciliations,
  saveDailyCashReconciliation,
  carryForwardDailyCash,
  submitDailyEntryForApproval,
  approveDailyEntry,
} from "../accountingDb";
import { uploadAccountingAttachment, uploadCompanyLogo } from "../imageUpload";
import {
  getInternalSecuritySettings,
  updateInternalSecuritySettings,
} from "../internalAuth";
import { normalizeMarketExchangeRate } from "../accountingRules";

const hasPermission = (permissions: string[], requiredPermission?: string) => {
  if (!requiredPermission) return false;
  if (
    permissions.includes("*") ||
    permissions.includes(requiredPermission) ||
    permissions.includes(`${requiredPermission.split(".")[0]}.*`)
  )
    return true;
  const impliedReadPermissions: Record<string, string[]> = {
    "accounting.read": ["accounting.manage"],
    "inventory.read": [
      "inventory.manage",
      "menu.items",
      "menu.movements",
      "menu.reports",
    ],
    "commerce.read": ["commerce.manage", "menu.partners", "menu.invoices"],
  };
  return (
    impliedReadPermissions[requiredPermission]?.some(permission =>
      permissions.includes(permission)
    ) ?? false
  );
};
const accessProcedure = (allowedRoles: string[], requiredPermission?: string) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    if (ctx.user.role === "admin") return next();
    const roles = await getAccountingRoleCodes(ctx.user.id);
    const permissions = await getAccountingPermissions(ctx.user.id);
    if (
      !roles.some(role => allowedRoles.includes(role)) &&
      !hasPermission(permissions, requiredPermission)
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "لا تملك صلاحية محاسبية لهذه العملية",
      });
    return next();
  });

const accountingReadProcedure = accessProcedure(
  [
    "system_admin",
    "finance_manager",
    "accountant",
    "cashier",
    "warehouse_keeper",
    "hr_manager",
  ],
  "accounting.read"
);
const accountingWriteProcedure = accessProcedure(
  ["system_admin", "finance_manager", "accountant", "cashier"],
  "documents.create"
);
const documentCreateProcedure = accessProcedure(
  [
    "system_admin",
    "finance_manager",
    "accountant",
    "cashier",
    "warehouse_keeper",
  ],
  "documents.create"
);
const accountingManagerProcedure = accessProcedure(
  ["system_admin", "finance_manager"],
  "accounting.manage"
);
const cashOpeningProcedure = accessProcedure(
  ["system_admin", "finance_manager", "accountant"],
  "accounting.cash.opening"
);
const cashApprovalProcedure = accessProcedure(
  ["system_admin", "finance_manager"],
  "accounting.cash.approve"
);
const permissionManagerProcedure = accessProcedure(
  ["system_admin"],
  "permissions.manage"
);
const companyBrandingProcedure = accessProcedure(
  ["system_admin"],
  "branding.manage"
);
const payrollProcedure = accessProcedure(
  ["system_admin", "finance_manager", "hr_manager"],
  "payroll.manage"
);
const documentApprovalProcedure = accessProcedure(
  ["system_admin", "finance_manager"],
  "documents.approve"
);
const reportingProcedure = accessProcedure(
  ["system_admin", "finance_manager", "accountant", "cashier"],
  "accounting.read"
);

const documentLine = z.object({
  variantId: z.coerce.number().int().positive().optional(),
  sourceDocumentLineId: z.coerce.number().int().positive().optional(),
  description: z.string().trim().min(1).max(255),
  quantity: z.coerce.number().int().positive(),
  unitPriceMinor: z.coerce.number().int().min(0),
  discountMinor: z.coerce.number().int().min(0).optional(),
});

export const accountingRouter = router({
  bootstrap: adminProcedure.mutation(({ ctx }) =>
    ensureAccountingSetup(ctx.user.id)
  ),
  access: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === "admin")
      return {
        canAccess: true,
        canManage: true,
        canManagePermissions: true,
        roles: ["system_admin"],
        permissions: ["*"],
      };
    const roles = await getAccountingRoleCodes(ctx.user.id);
    const permissions = await getAccountingPermissions(ctx.user.id);
    return {
      canAccess:
        roles.some(role =>
          [
            "system_admin",
            "finance_manager",
            "accountant",
            "cashier",
            "warehouse_keeper",
            "hr_manager",
          ].includes(role)
        ) || hasPermission(permissions, "accounting.read"),
      canManage:
        roles.some(role =>
          ["system_admin", "finance_manager"].includes(role)
        ) || hasPermission(permissions, "accounting.manage"),
      canManagePermissions:
        roles.includes("system_admin") ||
        hasPermission(permissions, "permissions.manage"),
      roles,
      permissions,
    };
  }),
  publicBranding: publicProcedure.query(() => getPublicCompanyBranding()),
  overview: accountingReadProcedure.query(({ ctx }) =>
    getAccountingOverview(ctx.user.id)
  ),
  accounts: accountingReadProcedure.query(({ ctx }) =>
    listAccountingAccounts(ctx.user.id)
  ),
  documents: accountingReadProcedure.query(({ ctx }) =>
    listAccountingDocuments(ctx.user.id)
  ),
  documentDraft: documentCreateProcedure
    .input(z.object({ documentId: z.coerce.number().int().positive() }))
    .query(({ ctx, input }) =>
      getAccountingDocumentDraftForUpdate({
        userId: ctx.user.id,
        documentId: input.documentId,
      })
    ),
  settlementTargets: accountingWriteProcedure
    .input(z.object({ type: z.enum(["receipt", "payment"]) }))
    .query(({ ctx, input }) => listSettlementTargets(ctx.user.id, input.type)),
  returnableSalesLines: accountingWriteProcedure.query(({ ctx }) =>
    listReturnableSalesLines(ctx.user.id)
  ),
  returnablePurchaseLines: accountingWriteProcedure.query(({ ctx }) =>
    listReturnablePurchaseLines(ctx.user.id)
  ),
  paymentAccounts: accountingReadProcedure.query(({ ctx }) =>
    listActivePaymentAccounts(ctx.user.id)
  ),
  priceLists: accountingWriteProcedure.query(({ ctx }) =>
    listActivePriceLists(ctx.user.id)
  ),
  calculateManualTax: reportingProcedure
    .input(
      z.object({
        rateBps: z.coerce.number().int().min(0).max(10_000),
        documentId: z.coerce.number().int().positive().optional(),
        startDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        endDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      calculateManualTax({ userId: ctx.user.id, ...input })
    ),
  priceListItems: accountingWriteProcedure
    .input(z.object({ priceListId: z.coerce.number().int().positive() }))
    .query(({ ctx, input }) =>
      listPriceListItems(ctx.user.id, input.priceListId)
    ),
  warehouses: accountingReadProcedure.query(({ ctx }) =>
    listActiveAccountingWarehouses(ctx.user.id)
  ),
  costCenters: accountingReadProcedure.query(({ ctx }) =>
    listActiveCostCenters(ctx.user.id)
  ),
  warehouseBalances: accountingReadProcedure.query(({ ctx }) =>
    listWarehouseVariantBalances(ctx.user.id)
  ),
  approvals: accountingManagerProcedure.query(({ ctx }) =>
    listApprovals(ctx.user.id)
  ),
  journals: accountingReadProcedure.query(({ ctx }) =>
    listJournalEntries(ctx.user.id)
  ),
  dailyEntries: accountingReadProcedure.query(({ ctx }) =>
    listDailyEntries(ctx.user.id)
  ),
  dailyCashSummary: accountingReadProcedure
    .input(
      z
        .object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          paymentAccountId: z.coerce.number().int().positive().optional(),
          currencyCode: z.enum(["USD", "IQD"]).optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) =>
      getDailyCashSummary({ userId: ctx.user.id, ...input })
    ),
  cashPeriodReport: accountingReadProcedure
    .input(
      z.object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paymentAccountId: z.coerce.number().int().positive().optional(),
        currencyCode: z.enum(["USD", "IQD"]).optional(),
      })
    )
    .query(({ ctx, input }) =>
      getCashPeriodReport({ userId: ctx.user.id, ...input })
    ),
  cashReconciliationHistory: accountingReadProcedure
    .input(
      z
        .object({
          fromDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          toDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          paymentAccountId: z.coerce.number().int().positive().optional(),
          limit: z.coerce.number().int().positive().max(365).optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) =>
      listDailyCashReconciliations({ userId: ctx.user.id, ...input })
    ),
  saveCashReconciliation: cashOpeningProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paymentAccountId: z.coerce.number().int().positive(),
        currencyCode: z.enum(["USD", "IQD"]),
        actualClosingMinor: z.coerce.number().int().nonnegative(),
        note: z.string().trim().max(255).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      saveDailyCashReconciliation({ userId: ctx.user.id, ...input })
    ),
  carryForwardCash: cashOpeningProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        paymentAccountId: z.coerce.number().int().positive(),
        currencyCode: z.enum(["USD", "IQD"]),
        note: z.string().trim().max(255).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      carryForwardDailyCash({ userId: ctx.user.id, ...input })
    ),
  submitDailyEntryForApproval: accountingWriteProcedure
    .input(z.object({ dailyEntryId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      submitDailyEntryForApproval({ userId: ctx.user.id, ...input })
    ),
  approveDailyEntry: cashApprovalProcedure
    .input(z.object({ dailyEntryId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      approveDailyEntry({ userId: ctx.user.id, ...input })
    ),
  createDailyEntry: accountingWriteProcedure
    .input(
      z.object({
        entryDate: z.coerce.date(),
        entryType: z.enum([
          "expense",
          "receipt",
          "payment",
          "transfer",
          "adjustment",
        ]),
        voucherNumber: z.string().trim().max(80).optional(),
        description: z.string().trim().min(1).max(255),
        category: z.string().trim().max(120).optional(),
        note: z.string().trim().max(2_000).optional(),
        currencyCode: z.enum(["USD", "IQD"]),
        marketExchangeRate: z.coerce.number().positive().optional(),
        amountMinor: z.coerce.number().int().positive(),
        debitAccountId: z.coerce.number().int().positive(),
        creditAccountId: z.coerce.number().int().positive(),
        costCenterId: z.coerce.number().int().positive().optional(),
        customerPartnerId: z.coerce.number().int().positive().optional(),
        supplierPartnerId: z.coerce.number().int().positive().optional(),
        paymentAccountId: z.coerce.number().int().positive().optional(),
        attachmentUrl: z
          .string()
          .startsWith("/manus-storage/")
          .max(2_000)
          .optional(),
        attachmentKey: z.string().max(2_000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const dailyRate = await getOrCreateDailyExchangeRate({
        userId: ctx.user.id,
        currencyCode: input.currencyCode,
        marketExchangeRate: input.marketExchangeRate,
        rateDate: input.entryDate,
      });
      const created = await createDailyEntry({
        userId: ctx.user.id,
        ...input,
        marketExchangeRate: dailyRate.marketExchangeRate,
      });
      // The daily-entry screen is a TOTAL9-style register: save and post in one action.
      return postDailyEntry({
        userId: ctx.user.id,
        dailyEntryId: created.id,
      });
    }),
  uploadDailyAttachment: accountingWriteProcedure
    .input(z.object({ dataUrl: z.string().min(64).max(12_000_000) }))
    .mutation(({ ctx, input }) =>
      uploadAccountingAttachment({
        userId: ctx.user.id,
        dataUrl: input.dataUrl,
      })
    ),
  importTotal9: accountingWriteProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              entryDate: z.coerce.date(),
              entryType: z.enum([
                "expense",
                "receipt",
                "payment",
                "transfer",
                "adjustment",
              ]),
              voucherNumber: z.string().trim().max(80).optional(),
              description: z.string().trim().min(1).max(255),
              category: z.string().trim().max(120).optional(),
              note: z.string().trim().max(2_000).optional(),
              sourceSheet: z.string().trim().max(120).optional(),
              currencyCode: z.enum(["USD", "IQD"]),
              marketExchangeRate: z.coerce.number().positive().optional(),
              amountMinor: z.coerce.number().int().positive(),
              debitAccountId: z.coerce.number().int().positive(),
              creditAccountId: z.coerce.number().int().positive(),
              customerPartnerId: z.coerce.number().int().positive().optional(),
              supplierPartnerId: z.coerce.number().int().positive().optional(),
              paymentAccountId: z.coerce.number().int().positive().optional(),
            })
          )
          .min(1)
          .max(2_000),
        autoPost: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.autoPost) {
        const roles = await getAccountingRoleCodes(ctx.user.id);
        const permissions = await getAccountingPermissions(ctx.user.id);
        if (
          ctx.user.role !== "admin" &&
          !roles.some(role =>
            ["system_admin", "finance_manager"].includes(role)
          ) &&
          !hasPermission(permissions, "accounting.manage")
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "الترحيل التلقائي يحتاج صلاحية إدارة المحاسبة",
          });
      }
      return importDailyEntries({
        userId: ctx.user.id,
        rows: input.rows,
        autoPost: input.autoPost,
      });
    }),
  postDailyEntry: accountingManagerProcedure
    .input(z.object({ dailyEntryId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      postDailyEntry({ userId: ctx.user.id, ...input })
    ),
  employees: payrollProcedure.query(({ ctx }) => listEmployees(ctx.user.id)),
  configuration: accountingManagerProcedure.query(({ ctx }) =>
    getAccountingConfiguration(ctx.user.id)
  ),
  uploadCompanyLogo: companyBrandingProcedure
    .input(z.object({ dataUrl: z.string().min(32).max(3_000_000) }))
    .mutation(({ ctx, input }) =>
      uploadCompanyLogo({ ...input, userId: ctx.user.id })
    ),
  updateCompanyBranding: companyBrandingProcedure
    .input(
      z.object({
        brandName: z.string().trim().min(1, "اكتب اسم الشركة").max(200),
        brandLogoUrl: z
          .string()
          .startsWith("/manus-storage/")
          .max(2_000)
          .nullable(),
        brandLogoKey: z.string().min(1).max(2_000).nullable(),
        showProductName: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) =>
      updateCompanyBranding({ ...input, userId: ctx.user.id })
    ),
  updateCompanyCountry: companyBrandingProcedure
    .input(z.object({ countryCode: z.enum(["IQ", "SY"]) }))
    .mutation(({ ctx, input }) =>
      updateCompanyCountry({ ...input, userId: ctx.user.id })
    ),
  accessConfiguration: permissionManagerProcedure.query(({ ctx }) =>
    getAccountingAccessConfiguration(ctx.user.id)
  ),
  permissionActivityLog: permissionManagerProcedure
    .input(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(5).max(50).default(20),
      })
    )
    .query(({ ctx, input }) =>
      getAccountingPermissionActivityPage(
        ctx.user.id,
        input.page,
        input.pageSize
      )
    ),
  permissionActivityArchive: permissionManagerProcedure
    .input(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
    )
    .query(({ ctx, input }) =>
      getAccountingPermissionActivityArchivePage(
        ctx.user.id,
        input.page,
        input.pageSize
      )
    ),
  archivePermissionActivity: permissionManagerProcedure
    .input(z.object({ eventId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      archiveAccountingPermissionActivity({
        userId: ctx.user.id,
        eventId: input.eventId,
      })
    ),
  reports: reportingProcedure
    .input(
      z
        .object({
          startDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .optional(),
          costCenterId: z.coerce.number().int().positive().optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) =>
      getFinancialReports({ userId: ctx.user.id, ...input })
    ),
  dailyExchangeRate: accountingReadProcedure
    .input(
      z
        .object({ currencyCode: z.string().trim().length(3).default("IQD") })
        .optional()
    )
    .query(({ ctx, input }) =>
      getOrCreateDailyExchangeRate({
        userId: ctx.user.id,
        currencyCode: input?.currencyCode ?? "IQD",
      })
    ),
  setDailyExchangeRate: accountingWriteProcedure
    .input(
      z.object({
        currencyCode: z.string().trim().length(3).default("IQD"),
        marketExchangeRate: z.coerce.number().finite().positive(),
      })
    )
    .mutation(({ ctx, input }) =>
      saveDailyExchangeRate({ ...input, userId: ctx.user.id })
    ),
  budgets: reportingProcedure.query(({ ctx }) =>
    getBudgetComparison(ctx.user.id)
  ),
  fixedAssets: reportingProcedure.query(({ ctx }) =>
    listFixedAssets(ctx.user.id)
  ),
  cheques: accountingReadProcedure.query(({ ctx }) => listCheques(ctx.user.id)),
  upsertBudget: accountingManagerProcedure
    .input(
      z.object({
        accountId: z.coerce.number().int().positive(),
        budgetMinor: z.coerce.number().int().min(0),
      })
    )
    .mutation(({ ctx, input }) =>
      upsertAccountingBudget({ userId: ctx.user.id, ...input })
    ),
  upsertPriceListItem: accountingManagerProcedure
    .input(
      z.object({
        priceListId: z.coerce.number().int().positive(),
        variantId: z.coerce.number().int().positive(),
        unitPriceMinor: z.coerce.number().int().min(0),
      })
    )
    .mutation(({ ctx, input }) =>
      upsertPriceListItem({ userId: ctx.user.id, ...input })
    ),
  upsertPriceListItemTier: accountingManagerProcedure
    .input(
      z.object({
        priceListId: z.coerce.number().int().positive(),
        variantId: z.coerce.number().int().positive(),
        minimumQuantity: z.coerce.number().int().min(2),
        unitPriceMinor: z.coerce.number().int().min(0),
      })
    )
    .mutation(({ ctx, input }) =>
      upsertPriceListItemTier({ userId: ctx.user.id, ...input })
    ),
  settleCheque: accountingManagerProcedure
    .input(
      z.object({
        chequeId: z.coerce.number().int().positive(),
        action: z.enum(["clear", "bounce"]),
        bankPaymentAccountId: z.coerce.number().int().positive().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      settleCheque({ userId: ctx.user.id, ...input })
    ),
  createFixedAsset: accountingManagerProcedure
    .input(
      z.object({
        assetNumber: z.string().trim().min(1).max(40),
        name: z.string().trim().min(2).max(180),
        acquiredAt: z.coerce.date(),
        acquisitionMinor: z.coerce.number().int().positive(),
        salvageMinor: z.coerce.number().int().min(0).default(0),
        usefulLifeMonths: z.coerce.number().int().min(1).max(1_200),
        branchId: z.coerce.number().int().positive().optional(),
        assetAccountId: z.coerce.number().int().positive(),
        accumulatedDepreciationAccountId: z.coerce.number().int().positive(),
        depreciationExpenseAccountId: z.coerce.number().int().positive(),
        creditAccountId: z.coerce.number().int().positive(),
      })
    )
    .mutation(({ ctx, input }) =>
      createFixedAsset({ ...input, userId: ctx.user.id })
    ),
  postFixedAssetDepreciation: accountingManagerProcedure
    .input(
      z.object({
        assetId: z.coerce.number().int().positive(),
        periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      })
    )
    .mutation(({ ctx, input }) =>
      postFixedAssetDepreciation({ ...input, userId: ctx.user.id })
    ),
  createDocument: documentCreateProcedure
    .input(
      z.object({
        type: z.enum([
          "saleInvoice",
          "purchaseInvoice",
          "salesReturn",
          "purchaseReturn",
          "receipt",
          "payment",
          "stockTransfer",
        ]),
        partnerId: z.coerce.number().int().positive().optional(),
        branchId: z.coerce.number().int().positive().optional(),
        warehouseId: z.coerce.number().int().positive().optional(),
        paymentAccountId: z.coerce.number().int().positive().optional(),
        destinationWarehouseId: z.coerce.number().int().positive().optional(),
        costCenterId: z.coerce.number().int().positive().optional(),
        priceListId: z.coerce.number().int().positive().optional(),
        settlements: z
          .array(
            z.object({
              targetDocumentId: z.coerce.number().int().positive(),
              amountMinor: z.coerce.number().int().positive(),
            })
          )
          .max(50)
          .optional(),
        dueAt: z.coerce.date().optional(),
        chequeNumber: z.string().trim().min(1).max(80).optional(),
        currencyCode: z.string().trim().length(3).default("USD"),
        marketExchangeRate: z.coerce.number().finite().positive().optional(),
        exchangeRatePpm: z.coerce.number().int().positive().optional(),
        note: z.string().trim().max(3000).optional(),
        lines: z.array(documentLine).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && input.type !== "stockTransfer") {
        const roles = await getAccountingRoleCodes(ctx.user.id);
        const permissions = await getAccountingPermissions(ctx.user.id);
        if (
          !roles.some(role =>
            [
              "system_admin",
              "finance_manager",
              "accountant",
              "cashier",
            ].includes(role)
          ) &&
          !hasPermission(permissions, "documents.financial.create")
        )
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "لا تملك صلاحية إنشاء مستند مالي",
          });
      }
      const currencyCode = input.currencyCode.toUpperCase();
      const legacyMarketRate =
        input.marketExchangeRate ??
        (input.exchangeRatePpm
          ? currencyCode === "USD"
            ? 1
            : 100_000_000 / input.exchangeRatePpm
          : undefined);
      const dailyRate = await getOrCreateDailyExchangeRate({
        userId: ctx.user.id,
        currencyCode,
        marketExchangeRate: legacyMarketRate,
      });
      const exchangeRate = normalizeMarketExchangeRate(
        currencyCode,
        dailyRate.marketExchangeRate
      );
      return createAccountingDocument({
        ...input,
        userId: ctx.user.id,
        autoPost: true,
        currencyCode,
        ...exchangeRate,
      });
    }),
  submitDocument: documentCreateProcedure
    .input(z.object({ documentId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      submitDocumentForApproval(input.documentId, ctx.user.id)
    ),
  cancelDocument: documentCreateProcedure
    .input(z.object({ documentId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      cancelAccountingDocument({
        documentId: input.documentId,
        userId: ctx.user.id,
      })
    ),
  updateDocumentDraft: documentCreateProcedure
    .input(
      z.object({
        documentId: z.coerce.number().int().positive(),
        partnerId: z.coerce.number().int().positive().optional(),
        warehouseId: z.coerce.number().int().positive().optional(),
        paymentAccountId: z.coerce.number().int().positive().optional(),
        destinationWarehouseId: z.coerce.number().int().positive().optional(),
        costCenterId: z.coerce.number().int().positive().optional(),
        priceListId: z.coerce.number().int().positive().optional(),
        settlements: z
          .array(
            z.object({
              targetDocumentId: z.coerce.number().int().positive(),
              amountMinor: z.coerce.number().int().positive(),
            })
          )
          .max(50)
          .optional(),
        dueAt: z.coerce.date().optional(),
        chequeNumber: z.string().trim().min(1).max(80).optional(),
        currencyCode: z.string().trim().length(3).default("USD"),
        marketExchangeRate: z.coerce.number().finite().positive().optional(),
        exchangeRatePpm: z.coerce.number().int().positive().optional(),
        historicalEdit: z.boolean().optional(),
        note: z.string().trim().max(3000).optional(),
        lines: z.array(documentLine).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currencyCode = input.currencyCode.toUpperCase();
      const legacyMarketRate =
        input.marketExchangeRate ??
        (input.exchangeRatePpm
          ? currencyCode === "USD"
            ? 1
            : 100_000_000 / input.exchangeRatePpm
          : undefined);
      const dailyRate = await getOrCreateDailyExchangeRate({
        userId: ctx.user.id,
        currencyCode,
        marketExchangeRate: legacyMarketRate,
      });
      const exchangeRate = normalizeMarketExchangeRate(
        currencyCode,
        dailyRate.marketExchangeRate
      );
      const permissions = await getAccountingPermissions(ctx.user.id);
      return updateAccountingDocumentDraft({
        ...input,
        userId: ctx.user.id,
        currencyCode,
        ...exchangeRate,
        allowHistoricalEdit:
          Boolean(input.historicalEdit) &&
          (ctx.user.role === "admin" ||
            hasPermission(permissions, "documents.editHistorical")),
      });
    }),
  approveDocument: documentApprovalProcedure
    .input(z.object({ documentId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      approveAndPostDocument(input.documentId, ctx.user.id)
    ),
  createPayroll: payrollProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        periodStart: z.coerce.date(),
        periodEnd: z.coerce.date(),
      })
    )
    .mutation(({ ctx, input }) =>
      createPayrollRun({ ...input, userId: ctx.user.id })
    ),
  payrollDetails: payrollProcedure.query(({ ctx }) =>
    listPayrollRunDetails(ctx.user.id)
  ),
  submitPayroll: payrollProcedure
    .input(z.object({ payrollRunId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      submitPayrollForApproval(input.payrollRunId, ctx.user.id)
    ),
  approvePayroll: accountingManagerProcedure
    .input(z.object({ payrollRunId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      approveAndPostPayroll(input.payrollRunId, ctx.user.id)
    ),
  createBranch: accountingManagerProcedure
    .input(
      z.object({
        code: z.string().trim().min(2).max(20),
        name: z.string().trim().min(2).max(160),
        warehouseName: z.string().trim().min(2).max(160),
      })
    )
    .mutation(({ ctx, input }) =>
      createAccountingBranch({ ...input, userId: ctx.user.id })
    ),
  createCostCenter: accountingManagerProcedure
    .input(
      z.object({
        code: z.string().trim().min(2).max(30),
        name: z.string().trim().min(2).max(160),
      })
    )
    .mutation(({ ctx, input }) =>
      createCostCenter({ ...input, userId: ctx.user.id })
    ),
  updateCostCenter: accountingManagerProcedure
    .input(
      z.object({
        costCenterId: z.coerce.number().int().positive(),
        name: z.string().trim().min(2).max(160),
        isActive: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) =>
      updateCostCenter({ ...input, userId: ctx.user.id })
    ),
  createEmployee: payrollProcedure
    .input(
      z.object({
        fullName: z.string().trim().min(2).max(180),
        employeeNumber: z.string().trim().min(1).max(40),
        jobTitle: z.string().trim().max(120).optional(),
        salaryAmount: z.coerce.number().finite().min(0),
        salaryCurrencyCode: z.string().trim().length(3).default("USD"),
        salaryExchangeRate: z.coerce.number().finite().positive().default(1),
        branchId: z.coerce.number().int().positive().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      createAccountingEmployee({
        ...input,
        userId: ctx.user.id,
        salaryCurrencyCode: input.salaryCurrencyCode.toUpperCase(),
      })
    ),
  employeeContracts: payrollProcedure.query(({ ctx }) =>
    listEmployeeContracts(ctx.user.id)
  ),
  createEmployeeContract: payrollProcedure
    .input(
      z.object({
        employeeId: z.coerce.number().int().positive(),
        contractNumber: z.string().trim().min(1).max(60),
        contractType: z.enum([
          "permanent",
          "fixedTerm",
          "partTime",
          "consultant",
        ]),
        startsOn: z.coerce.date(),
        endsOn: z.coerce.date().optional(),
        baseSalaryMinor: z.coerce.number().int().min(0),
        currencyCode: z.string().trim().length(3).default("USD"),
        allowances: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(80),
              amountMinor: z.coerce.number().int().min(0),
            })
          )
          .max(30),
        insuranceRateBps: z.coerce.number().int().min(0).max(10000),
        taxRateBps: z.coerce.number().int().min(0).max(10000),
      })
    )
    .mutation(({ ctx, input }) =>
      createEmployeeContract({
        ...input,
        userId: ctx.user.id,
        currencyCode: input.currencyCode.toUpperCase(),
      })
    ),
  employeeLeaves: payrollProcedure.query(({ ctx }) =>
    listEmployeeLeaves(ctx.user.id)
  ),
  createEmployeeLeave: payrollProcedure
    .input(
      z.object({
        employeeId: z.coerce.number().int().positive(),
        leaveType: z.enum(["annual", "sick", "unpaid", "maternity", "other"]),
        startsOn: z.coerce.date(),
        endsOn: z.coerce.date(),
        days: z.coerce.number().int().min(1).max(366),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      createEmployeeLeave({ ...input, userId: ctx.user.id })
    ),
  approveEmployeeLeave: accountingManagerProcedure
    .input(z.object({ leaveId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      approveEmployeeLeave({ ...input, userId: ctx.user.id })
    ),
  securitySettings: permissionManagerProcedure.query(({ ctx }) =>
    getInternalSecuritySettings(ctx.user.id)
  ),
  updateSecuritySettings: permissionManagerProcedure
    .input(
      z.object({
        sessionDurationMinutes: z.coerce.number().int().min(15).max(10080),
        maxFailedAttempts: z.coerce.number().int().min(3).max(20),
      })
    )
    .mutation(({ ctx, input }) =>
      updateInternalSecuritySettings(ctx.user.id, input)
    ),
  assignRole: permissionManagerProcedure
    .input(
      z.object({
        targetUserId: z.coerce.number().int().positive(),
        roleId: z.coerce.number().int().positive(),
        branchId: z.coerce.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const roleCodes = await getAccountingRoleCodes(ctx.user.id);
      return assignAccountingRole({
        ...input,
        userId: ctx.user.id,
        isOwner: ctx.user.role === "admin",
        canGrantSystemAdmin:
          ctx.user.role === "admin" || roleCodes.includes("system_admin"),
      });
    }),
  createCustomRole: permissionManagerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100),
        permissions: z.array(z.string().trim().min(3).max(100)).max(200),
      })
    )
    .mutation(({ ctx, input }) =>
      createCustomAccountingRole({
        ...input,
        userId: ctx.user.id,
        isOwner: ctx.user.role === "admin",
      })
    ),
  createInternalUser: permissionManagerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(180),
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[a-zA-Z0-9._-]+$/),
        password: z.string().min(10).max(256),
        roleId: z.coerce.number().int().positive(),
        branchId: z.coerce.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const roleCodes = await getAccountingRoleCodes(ctx.user.id);
      return createInternalUserAccount({
        ...input,
        userId: ctx.user.id,
        isOwner: ctx.user.role === "admin",
        canGrantSystemAdmin:
          ctx.user.role === "admin" || roleCodes.includes("system_admin"),
      });
    }),
  updateInternalUser: permissionManagerProcedure
    .input(
      z.object({
        targetUserId: z.coerce.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) =>
      updateInternalUserAccount({ ...input, userId: ctx.user.id })
    ),
  resetInternalUserPassword: permissionManagerProcedure
    .input(
      z.object({
        targetUserId: z.coerce.number().int().positive(),
        password: z.string().min(10).max(256),
      })
    )
    .mutation(({ ctx, input }) =>
      resetInternalUserPassword({ ...input, userId: ctx.user.id })
    ),
  updateRolePermissions: permissionManagerProcedure
    .input(
      z.object({
        roleId: z.coerce.number().int().positive(),
        permissions: z.array(z.string().trim().min(3).max(100)).max(200),
      })
    )
    .mutation(({ ctx, input }) =>
      updateAccountingRolePermissions({
        ...input,
        userId: ctx.user.id,
        isOwner: ctx.user.role === "admin",
      })
    ),
  updateCustomRole: permissionManagerProcedure
    .input(
      z.object({
        roleId: z.coerce.number().int().positive(),
        name: z.string().trim().min(2).max(100),
        permissions: z.array(z.string().trim().min(3).max(100)).max(200),
      })
    )
    .mutation(({ ctx, input }) =>
      updateCustomAccountingRole({
        ...input,
        userId: ctx.user.id,
        isOwner: ctx.user.role === "admin",
      })
    ),
  deleteCustomRole: permissionManagerProcedure
    .input(z.object({ roleId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      deleteCustomAccountingRole({ ...input, userId: ctx.user.id })
    ),
  createPaymentAccount: accountingManagerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        type: z.enum(["cash", "bank", "cheque"]),
        currencyCode: z.string().trim().length(3).default("USD"),
        isMultiCurrency: z.boolean().default(false),
        branchId: z.coerce.number().int().positive().optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      createPaymentAccount({
        ...input,
        userId: ctx.user.id,
        currencyCode: input.currencyCode.toUpperCase(),
      })
    ),
  updatePaymentAccount: accountingManagerProcedure
    .input(
      z.object({
        paymentAccountId: z.coerce.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(({ ctx, input }) =>
      updatePaymentAccount({ ...input, userId: ctx.user.id })
    ),
  recordAttendance: payrollProcedure
    .input(
      z.object({
        employeeId: z.coerce.number().int().positive(),
        workDate: z.coerce.date(),
        status: z.enum(["present", "absent", "leave", "holiday"]),
        overtimeMinutes: z.coerce.number().int().min(0).default(0),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .mutation(({ ctx, input }) =>
      recordAttendance({ ...input, userId: ctx.user.id })
    ),
  attendance: payrollProcedure.query(({ ctx }) =>
    listAttendanceForReview(ctx.user.id)
  ),
  submitAttendance: payrollProcedure
    .input(z.object({ attendanceId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      submitAttendanceForApproval({ ...input, userId: ctx.user.id })
    ),
  approveAttendance: accountingManagerProcedure
    .input(z.object({ attendanceId: z.coerce.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      approveAttendance({ ...input, userId: ctx.user.id })
    ),
  updatePayrollLine: payrollProcedure
    .input(
      z.object({
        payrollRunId: z.coerce.number().int().positive(),
        employeeId: z.coerce.number().int().positive(),
        advanceMinor: z.coerce.number().int().min(0),
        deductionMinor: z.coerce.number().int().min(0),
      })
    )
    .mutation(({ ctx, input }) =>
      updatePayrollLine({ ...input, userId: ctx.user.id })
    ),
  closePeriod: accountingManagerProcedure.mutation(({ ctx }) =>
    closeCurrentFiscalPeriod(ctx.user.id)
  ),
});
