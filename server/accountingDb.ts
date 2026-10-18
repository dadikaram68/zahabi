import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import {
  accountingAccounts,
  accountingApprovals,
  accountingAttendance,
  accountingAuditEventArchive,
  accountingAuditEvents,
  accountingBudgets,
  accountingBranches,
  accountingCheques,
  accountingCompanies,
  accountingCostCenters,
  accountingCurrencies,
  accountingDailyCashOpenings,
  accountingDailyCashReconciliations,
  accountingDailyEntries,
  accountingDailyExchangeRates,
  accountingDocumentLines,
  accountingDocumentSettlements,
  accountingDocuments,
  accountingDocumentSequences,
  accountingEmployees,
  accountingEmployeeContracts,
  accountingEmployeeLeaves,
  accountingAssetDepreciation,
  accountingFixedAssets,
  accountingFiscalPeriods,
  accountingJournalEntries,
  accountingJournalLines,
  accountingPayrollLines,
  accountingPayrollRuns,
  accountingInternalSecuritySettings,
  accountingInternalSessions,
  accountingPaymentAccounts,
  accountingPriceListItems,
  accountingPriceListItemTiers,
  accountingPriceLists,
  accountingTaxSettings,
  accountingRolePermissions,
  accountingRoles,
  accountingUserRoles,
  accountingWarehouses,
  accountingWarehouseVariantBalances,
  businessPartners,
  inventoryItems,
  inventoryMovements,
  inventoryVariants,
  users,
} from "../drizzle/schema";
import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hashInternalPassword, normalizeUsername } from "./internalAuth";
import {
  applyInboundInventoryValuation,
  applyOutboundInventoryValuation,
  applyPurchaseReturnInventoryValuation,
  assertApproverSeparation,
  assertBalancedJournal,
  assertBaseAmountRepresentable,
  assertDocumentSubmitter,
  buildStockTransferEffects,
  calculateBaseAmount,
  calculateDocumentTotals,
  calculateFinancialStatements,
  calculateStraightLineDepreciation,
  canManagerApproveOwnDocument,
  exceedsDiscountLimit,
  normalizeMarketExchangeRate,
  normalizeExchangeRatePpm,
} from "./accountingRules";

const DEFAULT_ACCOUNTS = [
  ["1110", "الصندوق", "asset", "debit"],
  ["1120", "الذمم المدينة", "asset", "debit"],
  ["1130", "المخزون", "asset", "debit"],
  ["1140", "شيكات تحت التحصيل", "asset", "debit"],
  ["1150", "ضريبة مدخلات قابلة للاسترداد", "asset", "debit"],
  ["1210", "البنوك", "asset", "debit"],
  ["1300", "الأصول الثابتة", "asset", "debit"],
  ["1310", "مجمع إهلاك الأصول", "asset", "credit"],
  ["2110", "الذمم الدائنة", "liability", "credit"],
  ["2120", "شيكات صادرة", "liability", "credit"],
  ["2130", "ضريبة مخرجات مستحقة", "liability", "credit"],
  ["2210", "رواتب مستحقة", "liability", "credit"],
  ["2220", "تأمينات اجتماعية مستحقة", "liability", "credit"],
  ["2230", "ضرائب رواتب مستحقة", "liability", "credit"],
  ["3100", "رأس المال", "equity", "credit"],
  ["4100", "مبيعات", "revenue", "credit"],
  ["5100", "تكلفة مبيعات", "expense", "debit"],
  ["6100", "مصاريف تشغيلية", "expense", "debit"],
  ["6200", "رواتب وأجور", "expense", "debit"],
  ["6300", "مصروف إهلاك", "expense", "debit"],
] as const;

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("تعذر الاتصال بقاعدة البيانات");
  return db;
}

async function ensurePayrollAccounts(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number
) {
  const required = [
    ["2220", "تأمينات اجتماعية مستحقة"],
    ["2230", "ضرائب رواتب مستحقة"],
  ] as const;
  const current = await db
    .select({ code: accountingAccounts.code })
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.companyId, companyId),
        inArray(
          accountingAccounts.code,
          required.map(item => item[0])
        )
      )
    );
  const existing = new Set(current.map(item => item.code));
  for (const [code, name] of required)
    if (!existing.has(code))
      await db
        .insert(accountingAccounts)
        .values({
          companyId,
          code,
          name,
          type: "liability",
          normalBalance: "credit",
        })
        .onDuplicateKeyUpdate({
          set: { code: sql`${accountingAccounts.code}` },
        });
}

export async function ensureAccountingSetup(ownerId: number) {
  const db = await dbOrThrow();
  const existing = await db
    .select()
    .from(accountingCompanies)
    .where(eq(accountingCompanies.companyKey, "PRIMARY"))
    .limit(1);
  if (existing[0]) {
    await ensurePayrollAccounts(db, existing[0].id);
    return existing[0];
  }
  try {
    return await db.transaction(async tx => {
      const companyInsert = await tx.insert(accountingCompanies).values({
        companyKey: "PRIMARY",
        name: "الشركة الرئيسية",
        baseCurrencyCode: "USD",
        fiscalYearStartMonth: 1,
        fiscalYearStartDay: 1,
        countryCode: "IQ",
      });
      const companyId = Number(companyInsert[0].insertId);
      const branchInsert = await tx
        .insert(accountingBranches)
        .values({ companyId, code: "MAIN", name: "الفرع الرئيسي" });
      const branchId = Number(branchInsert[0].insertId);
      await tx
        .insert(accountingWarehouses)
        .values({ branchId, code: "MAIN-WH", name: "المخزن الرئيسي" });
      await tx.insert(accountingCurrencies).values([
        {
          code: "USD",
          name: "دولار أمريكي",
          symbol: "$",
          decimalPlaces: 2,
          isBase: true,
        },
        { code: "IQD", name: "دينار عراقي", symbol: "د.ع", decimalPlaces: 0 },
        { code: "EUR", name: "يورو", symbol: "€", decimalPlaces: 2 },
      ]);
      const year = new Date().getUTCFullYear();
      const periodInsert = await tx.insert(accountingFiscalPeriods).values({
        companyId,
        name: `السنة المالية ${year}`,
        startsOn: new Date(Date.UTC(year, 0, 1)),
        endsOn: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      });
      const fiscalPeriodId = Number(periodInsert[0].insertId);
      const accountResults: Record<string, number> = {};
      for (const [code, name, type, normalBalance] of DEFAULT_ACCOUNTS) {
        const result = await tx
          .insert(accountingAccounts)
          .values({ companyId, code, name, type, normalBalance });
        accountResults[code] = Number(result[0].insertId);
      }
      await tx.insert(accountingTaxSettings).values({
        companyId,
        rateBps: 0,
        outputTaxAccountId: accountResults["2130"]!,
        inputTaxAccountId: accountResults["1150"]!,
        isActive: false,
      });
      await tx
        .insert(accountingCostCenters)
        .values({ companyId, code: "GENERAL", name: "الإدارة العامة" });
      await tx.insert(accountingPriceLists).values([
        {
          companyId,
          code: "RETAIL",
          name: "مفرد",
          currencyCode: "USD",
          maxDiscountBps: 500,
        },
        {
          companyId,
          code: "WHOLESALE",
          name: "جملة",
          currencyCode: "USD",
          maxDiscountBps: 1000,
        },
      ]);
      const roles = [
        ["system_admin", "مدير النظام"],
        ["finance_manager", "المدير المالي"],
        ["accountant", "محاسب"],
        ["cashier", "كاشير"],
        ["warehouse_keeper", "أمين مخزن"],
        ["hr_manager", "مسؤول موارد بشرية"],
      ] as const;
      const roleIds: Record<string, number> = {};
      for (const [code, name] of roles) {
        const result = await tx
          .insert(accountingRoles)
          .values({ companyId, code, name, isSystem: true });
        roleIds[code] = Number(result[0].insertId);
      }
      await tx.insert(accountingRolePermissions).values([
        { roleId: roleIds.system_admin!, permission: "*", isAllowed: true },
        {
          roleId: roleIds.finance_manager!,
          permission: "accounting.*",
          isAllowed: true,
        },
        {
          roleId: roleIds.accountant!,
          permission: "documents.create",
          isAllowed: true,
        },
        {
          roleId: roleIds.cashier!,
          permission: "payments.create",
          isAllowed: true,
        },
        {
          roleId: roleIds.warehouse_keeper!,
          permission: "inventory.manage",
          isAllowed: true,
        },
        {
          roleId: roleIds.hr_manager!,
          permission: "payroll.manage",
          isAllowed: true,
        },
      ]);
      await tx.insert(accountingUserRoles).values({
        userId: ownerId,
        roleId: roleIds.system_admin!,
        branchId,
        assignedBy: ownerId,
      });
      await tx.insert(accountingAuditEvents).values({
        entityType: "company",
        entityId: companyId,
        action: "bootstrap",
        afterJson: JSON.stringify({
          branchId,
          fiscalPeriodId,
          accountResults,
        }),
        performedBy: ownerId,
      });
      return {
        id: companyId,
        companyKey: "PRIMARY",
        name: "الشركة الرئيسية",
        baseCurrencyCode: "USD",
        fiscalYearStartMonth: 1,
        fiscalYearStartDay: 1,
        countryCode: "IQ",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  } catch (error) {
    const resolved = await db
      .select()
      .from(accountingCompanies)
      .where(eq(accountingCompanies.companyKey, "PRIMARY"))
      .limit(1);
    if (resolved[0]) return resolved[0];
    throw error;
  }
}

async function setupContext(userId: number) {
  const company = await ensureAccountingSetup(userId);
  const db = await dbOrThrow();
  const [branch] = await db
    .select()
    .from(accountingBranches)
    .where(eq(accountingBranches.companyId, company.id))
    .orderBy(asc(accountingBranches.id))
    .limit(1);
  const [period] = await db
    .select()
    .from(accountingFiscalPeriods)
    .where(
      and(
        eq(accountingFiscalPeriods.companyId, company.id),
        eq(accountingFiscalPeriods.status, "open")
      )
    )
    .orderBy(desc(accountingFiscalPeriods.startsOn))
    .limit(1);
  if (!branch || !period) throw new Error("لا يوجد فرع أو فترة مالية مفتوحة");
  return { company, branch, period };
}

function exchangeRateDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export async function getOrCreateDailyExchangeRate(input: {
  userId: number;
  currencyCode: string;
  rateDate?: Date;
  marketExchangeRate?: number;
}) {
  const code = input.currencyCode.toUpperCase();
  if (code === "USD")
    return {
      currencyCode: code,
      marketExchangeRate: 1,
      exchangeRatePpm: 1_000_000,
      rateDate: exchangeRateDate(input.rateDate),
    };
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const rateDate = exchangeRateDate(input.rateDate);
  const [existing] = await db
    .select()
    .from(accountingDailyExchangeRates)
    .where(
      and(
        eq(accountingDailyExchangeRates.companyId, company.id),
        eq(accountingDailyExchangeRates.currencyCode, code),
        eq(accountingDailyExchangeRates.rateDate, rateDate)
      )
    )
    .limit(1);
  if (existing) {
    const normalized = normalizeMarketExchangeRate(
      code,
      Number(existing.marketExchangeRate)
    );
    if (Number(existing.exchangeRatePpm) !== normalized.exchangeRatePpm) {
      await db
        .update(accountingDailyExchangeRates)
        .set({ exchangeRatePpm: normalized.exchangeRatePpm })
        .where(eq(accountingDailyExchangeRates.id, existing.id));
    }
    return { currencyCode: code, ...normalized, rateDate };
  }
  const [latest] = await db
    .select()
    .from(accountingDailyExchangeRates)
    .where(
      and(
        eq(accountingDailyExchangeRates.companyId, company.id),
        eq(accountingDailyExchangeRates.currencyCode, code),
        lte(accountingDailyExchangeRates.rateDate, rateDate)
      )
    )
    .orderBy(desc(accountingDailyExchangeRates.rateDate))
    .limit(1);
  const normalized = normalizeMarketExchangeRate(
    code,
    input.marketExchangeRate ??
      (latest ? Number(latest.marketExchangeRate) : 1570)
  );
  await db.insert(accountingDailyExchangeRates).values({
    companyId: company.id,
    currencyCode: code,
    rateDate,
    marketExchangeRate: String(normalized.marketExchangeRate),
    exchangeRatePpm: normalized.exchangeRatePpm,
    setBy: input.userId,
  });
  return { currencyCode: code, ...normalized, rateDate };
}

export async function saveDailyExchangeRate(input: {
  userId: number;
  currencyCode: string;
  marketExchangeRate: number;
  rateDate?: Date;
}) {
  const code = input.currencyCode.toUpperCase();
  if (code === "USD") return getOrCreateDailyExchangeRate(input);
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const rateDate = exchangeRateDate(input.rateDate);
  const normalized = normalizeMarketExchangeRate(
    code,
    input.marketExchangeRate
  );
  const [existing] = await db
    .select({ id: accountingDailyExchangeRates.id })
    .from(accountingDailyExchangeRates)
    .where(
      and(
        eq(accountingDailyExchangeRates.companyId, company.id),
        eq(accountingDailyExchangeRates.currencyCode, code),
        eq(accountingDailyExchangeRates.rateDate, rateDate)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(accountingDailyExchangeRates)
      .set({
        marketExchangeRate: String(normalized.marketExchangeRate),
        exchangeRatePpm: normalized.exchangeRatePpm,
        setBy: input.userId,
      })
      .where(eq(accountingDailyExchangeRates.id, existing.id));
  } else {
    await db.insert(accountingDailyExchangeRates).values({
      companyId: company.id,
      currencyCode: code,
      rateDate,
      marketExchangeRate: String(normalized.marketExchangeRate),
      exchangeRatePpm: normalized.exchangeRatePpm,
      setBy: input.userId,
    });
  }
  return { currencyCode: code, ...normalized, rateDate };
}

function formatAssetPeriodKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function assetPeriodBounds(periodKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey))
    throw new Error("شهر الإهلاك يجب أن يكون بصيغة YYYY-MM");
  const [year, month] = periodKey.split("-").map(Number);
  const startsOn = new Date(Date.UTC(year!, month! - 1, 1));
  const endsOn = new Date(Date.UTC(year!, month!, 0, 23, 59, 59, 999));
  return { startsOn, endsOn };
}

function nextAssetPeriodKey(periodKey: string) {
  const { startsOn } = assetPeriodBounds(periodKey);
  return formatAssetPeriodKey(
    new Date(Date.UTC(startsOn.getUTCFullYear(), startsOn.getUTCMonth() + 1, 1))
  );
}

function firstDepreciableAssetPeriod(acquiredAt: Date) {
  return formatAssetPeriodKey(
    new Date(
      Date.UTC(acquiredAt.getUTCFullYear(), acquiredAt.getUTCMonth() + 1, 1)
    )
  );
}

export async function getAccountingOverview(userId: number) {
  const db = await dbOrThrow();
  const { company, branch, period } = await setupContext(userId);
  const [accounts, documents, pending, journals, employees, branches] =
    await Promise.all([
      db
        .select({ value: sql<number>`count(*)` })
        .from(accountingAccounts)
        .where(eq(accountingAccounts.companyId, company.id)),
      db
        .select({ value: sql<number>`count(*)` })
        .from(accountingDocuments)
        .where(eq(accountingDocuments.companyId, company.id)),
      db
        .select({ value: sql<number>`count(*)` })
        .from(accountingDocuments)
        .where(
          and(
            eq(accountingDocuments.companyId, company.id),
            eq(accountingDocuments.status, "pendingApproval")
          )
        ),
      db
        .select({ value: sql<number>`count(*)` })
        .from(accountingJournalEntries)
        .where(
          and(
            eq(accountingJournalEntries.companyId, company.id),
            eq(accountingJournalEntries.status, "posted")
          )
        ),
      db
        .select({ value: sql<number>`count(*)` })
        .from(accountingEmployees)
        .where(eq(accountingEmployees.companyId, company.id)),
      db
        .select()
        .from(accountingBranches)
        .where(eq(accountingBranches.companyId, company.id)),
    ]);
  const recentDocuments = await db
    .select({
      id: accountingDocuments.id,
      documentNumber: accountingDocuments.documentNumber,
      type: accountingDocuments.type,
      status: accountingDocuments.status,
      totalMinor: accountingDocuments.totalMinor,
      currencyCode: accountingDocuments.currencyCode,
      createdAt: accountingDocuments.createdAt,
      partnerName: businessPartners.name,
    })
    .from(accountingDocuments)
    .leftJoin(
      businessPartners,
      eq(accountingDocuments.partnerId, businessPartners.id)
    )
    .where(eq(accountingDocuments.companyId, company.id))
    .orderBy(desc(accountingDocuments.createdAt))
    .limit(10);
  return {
    company,
    activeBranch: branch,
    activePeriod: period,
    branches,
    metrics: {
      accounts: Number(accounts[0]?.value ?? 0),
      documents: Number(documents[0]?.value ?? 0),
      pending: Number(pending[0]?.value ?? 0),
      postedJournals: Number(journals[0]?.value ?? 0),
      employees: Number(employees[0]?.value ?? 0),
    },
    recentDocuments,
  };
}

export async function listAccountingAccounts(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select()
    .from(accountingAccounts)
    .where(eq(accountingAccounts.companyId, company.id))
    .orderBy(asc(accountingAccounts.code));
}

type FixedAssetCreateInput = {
  userId: number;
  assetNumber: string;
  name: string;
  acquiredAt: Date;
  acquisitionMinor: number;
  salvageMinor: number;
  usefulLifeMonths: number;
  branchId?: number;
  assetAccountId: number;
  accumulatedDepreciationAccountId: number;
  depreciationExpenseAccountId: number;
  creditAccountId: number;
};

async function resolveFixedAssetAccountsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: Pick<
    FixedAssetCreateInput,
    | "assetAccountId"
    | "accumulatedDepreciationAccountId"
    | "depreciationExpenseAccountId"
  > & { creditAccountId?: number }
) {
  const selectedIds = [
    input.assetAccountId,
    input.accumulatedDepreciationAccountId,
    input.depreciationExpenseAccountId,
    ...(input.creditAccountId ? [input.creditAccountId] : []),
  ];
  if (new Set(selectedIds).size !== selectedIds.length)
    throw new Error("يجب اختيار حسابات أصول وإهلاك وتمويل مختلفة");
  const accounts = await tx
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.companyId, companyId),
        inArray(accountingAccounts.id, selectedIds),
        eq(accountingAccounts.isActive, true),
        eq(accountingAccounts.acceptsPosting, true)
      )
    );
  if (accounts.length !== selectedIds.length)
    throw new Error("أحد الحسابات المختارة غير نشط أو لا يتبع الشركة الحالية");
  const byId = new Map(accounts.map(account => [account.id, account]));
  const assetAccount = byId.get(input.assetAccountId)!;
  const accumulatedAccount = byId.get(input.accumulatedDepreciationAccountId)!;
  const expenseAccount = byId.get(input.depreciationExpenseAccountId)!;
  const creditAccount = input.creditAccountId
    ? byId.get(input.creditAccountId)!
    : undefined;
  if (
    assetAccount.type !== "asset" ||
    accumulatedAccount.type !== "asset" ||
    accumulatedAccount.normalBalance !== "credit" ||
    expenseAccount.type !== "expense"
  ) {
    throw new Error(
      "حسابات الأصل أو مجمع الإهلاك أو مصروف الإهلاك لا توافق تصنيفها المحاسبي المطلوب"
    );
  }
  return { assetAccount, accumulatedAccount, expenseAccount, creditAccount };
}

export async function listFixedAssetsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number
) {
  const assetRows = await tx
    .select({
      id: accountingFixedAssets.id,
      assetNumber: accountingFixedAssets.assetNumber,
      name: accountingFixedAssets.name,
      acquiredAt: accountingFixedAssets.acquiredAt,
      acquisitionMinor: accountingFixedAssets.acquisitionMinor,
      salvageMinor: accountingFixedAssets.salvageMinor,
      usefulLifeMonths: accountingFixedAssets.usefulLifeMonths,
      accumulatedDepreciationMinor:
        accountingFixedAssets.accumulatedDepreciationMinor,
      status: accountingFixedAssets.status,
      branchId: accountingFixedAssets.branchId,
      branchName: accountingBranches.name,
      assetAccountId: accountingFixedAssets.assetAccountId,
      accumulatedDepreciationAccountId:
        accountingFixedAssets.accumulatedDepreciationAccountId,
      depreciationExpenseAccountId:
        accountingFixedAssets.depreciationExpenseAccountId,
      createdAt: accountingFixedAssets.createdAt,
    })
    .from(accountingFixedAssets)
    .leftJoin(
      accountingBranches,
      eq(accountingFixedAssets.branchId, accountingBranches.id)
    )
    .where(eq(accountingFixedAssets.companyId, companyId))
    .orderBy(
      desc(accountingFixedAssets.acquiredAt),
      asc(accountingFixedAssets.assetNumber)
    );
  const accountIds = Array.from(
    new Set(
      assetRows.flatMap(asset => [
        asset.assetAccountId,
        asset.accumulatedDepreciationAccountId,
        asset.depreciationExpenseAccountId,
      ])
    )
  );
  const accounts = accountIds.length
    ? await tx
        .select({
          id: accountingAccounts.id,
          code: accountingAccounts.code,
          name: accountingAccounts.name,
        })
        .from(accountingAccounts)
        .where(
          and(
            eq(accountingAccounts.companyId, companyId),
            inArray(accountingAccounts.id, accountIds)
          )
        )
    : [];
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const assets = assetRows.map(asset => ({
    ...asset,
    assetAccountCode: accountsById.get(asset.assetAccountId)?.code ?? "",
    assetAccountName: accountsById.get(asset.assetAccountId)?.name ?? "",
    accumulatedDepreciationAccountCode:
      accountsById.get(asset.accumulatedDepreciationAccountId)?.code ?? "",
    accumulatedDepreciationAccountName:
      accountsById.get(asset.accumulatedDepreciationAccountId)?.name ?? "",
    depreciationExpenseAccountCode:
      accountsById.get(asset.depreciationExpenseAccountId)?.code ?? "",
    depreciationExpenseAccountName:
      accountsById.get(asset.depreciationExpenseAccountId)?.name ?? "",
  }));
  const depreciation = assets.length
    ? await tx
        .select({
          assetId: accountingAssetDepreciation.assetId,
          periodKey: accountingAssetDepreciation.periodKey,
          depreciationMinor: accountingAssetDepreciation.depreciationMinor,
          postedAt: accountingAssetDepreciation.postedAt,
          journalEntryId: accountingAssetDepreciation.journalEntryId,
          entryNumber: accountingJournalEntries.entryNumber,
        })
        .from(accountingAssetDepreciation)
        .innerJoin(
          accountingJournalEntries,
          eq(
            accountingAssetDepreciation.journalEntryId,
            accountingJournalEntries.id
          )
        )
        .where(
          inArray(
            accountingAssetDepreciation.assetId,
            assets.map(asset => asset.id)
          )
        )
        .orderBy(desc(accountingAssetDepreciation.periodKey))
    : [];
  return { assets, depreciation };
}

export async function listFixedAssets(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return listFixedAssetsInTransaction(db, company.id);
}

export async function createFixedAssetInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  input: FixedAssetCreateInput
) {
  if (
    !Number.isInteger(input.acquisitionMinor) ||
    input.acquisitionMinor <= 0 ||
    !Number.isInteger(input.salvageMinor) ||
    input.salvageMinor < 0 ||
    input.salvageMinor >= input.acquisitionMinor ||
    !Number.isInteger(input.usefulLifeMonths) ||
    input.usefulLifeMonths <= 0 ||
    input.usefulLifeMonths > 1_200
  ) {
    throw new Error("تكلفة الأصل وقيمته المتبقية وعمره الإنتاجي غير صالحة");
  }
  const assetNumber = input.assetNumber.trim().toUpperCase();
  if (!assetNumber) throw new Error("رقم الأصل مطلوب");
  if (
    input.acquiredAt < context.period.startsOn ||
    input.acquiredAt > context.period.endsOn
  )
    throw new Error("تاريخ الاستحواذ يجب أن يكون ضمن الفترة المالية المفتوحة");
  const [duplicate] = await tx
    .select({ id: accountingFixedAssets.id })
    .from(accountingFixedAssets)
    .where(
      and(
        eq(accountingFixedAssets.companyId, context.company.id),
        eq(accountingFixedAssets.assetNumber, assetNumber)
      )
    )
    .limit(1);
  if (duplicate) throw new Error("رقم الأصل مستخدم بالفعل ضمن الشركة");
  const branch = input.branchId
    ? await tx
        .select({ id: accountingBranches.id })
        .from(accountingBranches)
        .where(
          and(
            eq(accountingBranches.id, input.branchId),
            eq(accountingBranches.companyId, context.company.id),
            eq(accountingBranches.isActive, true)
          )
        )
        .limit(1)
    : [context.branch];
  if (!branch[0]) throw new Error("فرع الأصل غير صالح أو غير نشط");
  const accounts = await resolveFixedAssetAccountsInTransaction(
    tx as never,
    context.company.id,
    input
  );
  const assetInsert = await tx.insert(accountingFixedAssets).values({
    companyId: context.company.id,
    branchId: branch[0].id,
    assetNumber,
    name: input.name.trim(),
    acquiredAt: input.acquiredAt,
    acquisitionMinor: input.acquisitionMinor,
    salvageMinor: input.salvageMinor,
    usefulLifeMonths: input.usefulLifeMonths,
    assetAccountId: accounts.assetAccount.id,
    accumulatedDepreciationAccountId: accounts.accumulatedAccount.id,
    depreciationExpenseAccountId: accounts.expenseAccount.id,
    createdBy: input.userId,
  });
  const assetId = Number(assetInsert[0].insertId);
  const lines = [
    {
      accountId: accounts.assetAccount.id,
      debitMinor: input.acquisitionMinor,
      creditMinor: 0,
      baseDebitMinor: input.acquisitionMinor,
      baseCreditMinor: 0,
    },
    {
      accountId: accounts.creditAccount!.id,
      debitMinor: 0,
      creditMinor: input.acquisitionMinor,
      baseDebitMinor: 0,
      baseCreditMinor: input.acquisitionMinor,
    },
  ];
  assertBalancedJournal(lines);
  const entryInsert = await tx.insert(accountingJournalEntries).values({
    companyId: context.company.id,
    branchId: branch[0].id,
    fiscalPeriodId: context.period.id,
    entryNumber: `AST-${assetId}`,
    entryDate: input.acquiredAt,
    sourceType: "fixedAssetAcquisition",
    sourceId: assetId,
    status: "posted",
    memo: `رسملة أصل ثابت: ${assetNumber} — ${input.name.trim()}`,
    postedBy: input.userId,
    postedAt: new Date(),
    createdBy: input.userId,
  });
  const journalEntryId = Number(entryInsert[0].insertId);
  await tx.insert(accountingJournalLines).values(
    lines.map(line => ({
      ...line,
      journalEntryId,
      currencyCode: "USD",
      exchangeRatePpm: 1_000_000,
    }))
  );
  await tx.insert(accountingAuditEvents).values({
    entityType: "fixedAsset",
    entityId: assetId,
    action: "createdAndCapitalized",
    afterJson: JSON.stringify({
      assetNumber,
      acquisitionMinor: input.acquisitionMinor,
      salvageMinor: input.salvageMinor,
      usefulLifeMonths: input.usefulLifeMonths,
      journalEntryId,
      creditAccountId: accounts.creditAccount!.id,
    }),
    performedBy: input.userId,
  });
  return {
    id: assetId,
    assetNumber,
    journalEntryId,
    status: "active" as const,
  };
}

export async function createFixedAsset(input: FixedAssetCreateInput) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    createFixedAssetInTransaction(tx as never, context, input)
  );
}

export async function postFixedAssetDepreciationInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  input: { userId: number; assetId: number; periodKey: string }
) {
  const { startsOn, endsOn } = assetPeriodBounds(input.periodKey);
  if (startsOn < context.period.startsOn || endsOn > context.period.endsOn)
    throw new Error(
      "شهر الإهلاك يجب أن يقع بالكامل ضمن الفترة المالية المفتوحة"
    );
  const [asset] = await tx
    .select()
    .from(accountingFixedAssets)
    .where(
      and(
        eq(accountingFixedAssets.id, input.assetId),
        eq(accountingFixedAssets.companyId, context.company.id)
      )
    )
    .limit(1);
  if (!asset || asset.status !== "active")
    throw new Error("الأصل غير نشط أو لا يتبع الشركة الحالية");
  const firstPeriod = firstDepreciableAssetPeriod(asset.acquiredAt);
  if (input.periodKey < firstPeriod)
    throw new Error("يبدأ الإهلاك من بداية الشهر التالي لتاريخ الاستحواذ");
  const priorDepreciation = await tx
    .select()
    .from(accountingAssetDepreciation)
    .where(eq(accountingAssetDepreciation.assetId, asset.id))
    .orderBy(desc(accountingAssetDepreciation.periodKey))
    .limit(1);
  const expectedPeriod = priorDepreciation[0]
    ? nextAssetPeriodKey(priorDepreciation[0].periodKey)
    : firstPeriod;
  if (input.periodKey !== expectedPeriod)
    throw new Error(`يجب ترحيل الإهلاك بشكل متسلسل للشهر ${expectedPeriod}`);
  const accounts = await resolveFixedAssetAccountsInTransaction(
    tx as never,
    context.company.id,
    {
      assetAccountId: asset.assetAccountId,
      accumulatedDepreciationAccountId: asset.accumulatedDepreciationAccountId,
      depreciationExpenseAccountId: asset.depreciationExpenseAccountId,
    }
  );
  const calculation = calculateStraightLineDepreciation({
    acquisitionMinor: Number(asset.acquisitionMinor),
    salvageMinor: Number(asset.salvageMinor),
    usefulLifeMonths: asset.usefulLifeMonths,
    accumulatedDepreciationMinor: Number(asset.accumulatedDepreciationMinor),
  });
  if (calculation.monthlyMinor <= 0)
    throw new Error("اكتمل إهلاك الأصل إلى قيمته المتبقية");
  const lines = [
    {
      accountId: accounts.expenseAccount.id,
      debitMinor: calculation.monthlyMinor,
      creditMinor: 0,
      baseDebitMinor: calculation.monthlyMinor,
      baseCreditMinor: 0,
    },
    {
      accountId: accounts.accumulatedAccount.id,
      debitMinor: 0,
      creditMinor: calculation.monthlyMinor,
      baseDebitMinor: 0,
      baseCreditMinor: calculation.monthlyMinor,
    },
  ];
  assertBalancedJournal(lines);
  const entryInsert = await tx.insert(accountingJournalEntries).values({
    companyId: context.company.id,
    branchId: asset.branchId ?? context.branch.id,
    fiscalPeriodId: context.period.id,
    entryNumber: `DEP-${asset.id}-${input.periodKey}`,
    entryDate: endsOn,
    sourceType: "fixedAssetDepreciation",
    sourceId: asset.id,
    status: "posted",
    memo: `إهلاك أصل ثابت ${asset.assetNumber} — ${input.periodKey}`,
    postedBy: input.userId,
    postedAt: new Date(),
    createdBy: input.userId,
  });
  const journalEntryId = Number(entryInsert[0].insertId);
  await tx.insert(accountingJournalLines).values(
    lines.map(line => ({
      ...line,
      journalEntryId,
      currencyCode: "USD",
      exchangeRatePpm: 1_000_000,
    }))
  );
  await tx.insert(accountingAssetDepreciation).values({
    assetId: asset.id,
    fiscalPeriodId: context.period.id,
    periodKey: input.periodKey,
    depreciationMinor: calculation.monthlyMinor,
    journalEntryId,
    postedBy: input.userId,
  });
  const accumulatedDepreciationMinor =
    Number(asset.accumulatedDepreciationMinor) + calculation.monthlyMinor;
  const status =
    accumulatedDepreciationMinor >=
    Number(asset.acquisitionMinor) - Number(asset.salvageMinor)
      ? ("fullyDepreciated" as const)
      : ("active" as const);
  await tx
    .update(accountingFixedAssets)
    .set({ accumulatedDepreciationMinor, status })
    .where(eq(accountingFixedAssets.id, asset.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "fixedAsset",
    entityId: asset.id,
    action: "depreciationPosted",
    afterJson: JSON.stringify({
      periodKey: input.periodKey,
      depreciationMinor: calculation.monthlyMinor,
      accumulatedDepreciationMinor,
      journalEntryId,
      status,
    }),
    performedBy: input.userId,
  });
  return {
    assetId: asset.id,
    periodKey: input.periodKey,
    depreciationMinor: calculation.monthlyMinor,
    accumulatedDepreciationMinor,
    journalEntryId,
    status,
  };
}

export async function postFixedAssetDepreciation(input: {
  userId: number;
  assetId: number;
  periodKey: string;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    postFixedAssetDepreciationInTransaction(tx as never, context, input)
  );
}

export async function listAccountingDocuments(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const roles = await getAccountingRoleCodes(userId);
  const isWarehouseOnly =
    roles.includes("warehouse_keeper") &&
    !roles.some(role =>
      ["system_admin", "finance_manager", "accountant", "cashier"].includes(
        role
      )
    );
  const rows = await db
    .select({
      id: accountingDocuments.id,
      documentNumber: accountingDocuments.documentNumber,
      type: accountingDocuments.type,
      status: accountingDocuments.status,
      totalMinor: accountingDocuments.totalMinor,
      currencyCode: accountingDocuments.currencyCode,
      createdAt: accountingDocuments.createdAt,
      createdBy: accountingDocuments.createdBy,
      partnerName: businessPartners.name,
      branchName: accountingBranches.name,
    })
    .from(accountingDocuments)
    .leftJoin(
      businessPartners,
      eq(accountingDocuments.partnerId, businessPartners.id)
    )
    .innerJoin(
      accountingBranches,
      eq(accountingDocuments.branchId, accountingBranches.id)
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        ...(isWarehouseOnly ? [eq(accountingDocuments.createdBy, userId)] : [])
      )
    )
    .orderBy(desc(accountingDocuments.createdAt))
    .limit(100);
  const permissions = await getAccountingPermissions(userId);
  const canEditPosted =
    roles.some(role => ["system_admin", "finance_manager"].includes(role)) ||
    permissions.includes("*") ||
    permissions.includes("documents.editHistorical") ||
    permissions.includes("accounting.manage");
  return rows.map(row => ({
    ...row,
    canEditDraft: row.status === "draft" && row.createdBy === userId,
    canEditPosted: row.status === "posted" && canEditPosted,
  }));
}

export async function getAccountingDocumentDraftForUpdate(input: {
  userId: number;
  documentId: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [document] = await db
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.id, input.documentId),
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.id, input.documentId)
      )
    )
    .limit(1);
  const roles = await getAccountingRoleCodes(input.userId);
  const permissions = await getAccountingPermissions(input.userId);
  const canEditPosted =
    roles.some(role => ["system_admin", "finance_manager"].includes(role)) ||
    permissions.includes("*") ||
    permissions.includes("documents.editHistorical") ||
    permissions.includes("accounting.manage");
  if (!document ||
      (document.status === "draft" && document.createdBy !== input.userId) ||
      (document.status === "posted" && !canEditPosted) ||
      !["draft", "posted"].includes(document.status))
    throw new Error("لا تملك صلاحية فتح هذا المستند للتعديل");
  const [lines, settlements] = await Promise.all([
    db
      .select()
      .from(accountingDocumentLines)
      .where(eq(accountingDocumentLines.documentId, document.id))
      .orderBy(asc(accountingDocumentLines.id)),
    db
      .select({
        targetDocumentId: accountingDocumentSettlements.targetDocumentId,
        amountMinor: accountingDocumentSettlements.amountMinor,
      })
      .from(accountingDocumentSettlements)
      .where(
        eq(accountingDocumentSettlements.settlementDocumentId, document.id)
      ),
  ]);
  return { document, lines, settlements };
}

export async function listSettlementTargets(
  userId: number,
  settlementType: "receipt" | "payment"
) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const targetType =
    settlementType === "receipt" ? "saleInvoice" : "purchaseInvoice";
  const invoices = await db
    .select({
      id: accountingDocuments.id,
      documentNumber: accountingDocuments.documentNumber,
      partnerId: businessPartners.id,
      partnerName: businessPartners.name,
      currencyCode: accountingDocuments.currencyCode,
      totalMinor: accountingDocuments.totalMinor,
    })
    .from(accountingDocuments)
    .innerJoin(
      businessPartners,
      eq(accountingDocuments.partnerId, businessPartners.id)
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.type, targetType),
        eq(accountingDocuments.status, "posted")
      )
    )
    .orderBy(desc(accountingDocuments.postedAt));
  const allocations = await db
    .select({
      targetDocumentId: accountingDocumentSettlements.targetDocumentId,
      totalMinor: sql<number>`coalesce(sum(${accountingDocumentSettlements.amountMinor}), 0)`,
    })
    .from(accountingDocumentSettlements)
    .innerJoin(
      accountingDocuments,
      eq(
        accountingDocumentSettlements.settlementDocumentId,
        accountingDocuments.id
      )
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.status, "posted")
      )
    )
    .groupBy(accountingDocumentSettlements.targetDocumentId);
  const allocatedByInvoice = new Map(
    allocations.map(row => [row.targetDocumentId, Number(row.totalMinor)])
  );
  return invoices
    .map(invoice => ({
      ...invoice,
      outstandingMinor: Math.max(
        0,
        Number(invoice.totalMinor) - (allocatedByInvoice.get(invoice.id) ?? 0)
      ),
    }))
    .filter(invoice => invoice.outstandingMinor > 0);
}

export async function listReturnableSalesLines(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      id: accountingDocumentLines.id,
      documentNumber: accountingDocuments.documentNumber,
      variantId: accountingDocumentLines.variantId,
      description: accountingDocumentLines.description,
      quantity: accountingDocumentLines.quantity,
      unitPriceMinor: accountingDocumentLines.unitPriceMinor,
      unitCostUsdMinor: accountingDocumentLines.unitCostUsdMinor,
    })
    .from(accountingDocumentLines)
    .innerJoin(
      accountingDocuments,
      eq(accountingDocumentLines.documentId, accountingDocuments.id)
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.type, "saleInvoice"),
        eq(accountingDocuments.status, "posted"),
        sql`${accountingDocumentLines.variantId} is not null`,
        sql`${accountingDocumentLines.unitCostUsdMinor} is not null`
      )
    )
    .orderBy(
      desc(accountingDocuments.postedAt),
      desc(accountingDocumentLines.id)
    )
    .limit(200);
}

export async function listReturnablePurchaseLines(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const lines = await db
    .select({
      id: accountingDocumentLines.id,
      documentNumber: accountingDocuments.documentNumber,
      variantId: accountingDocumentLines.variantId,
      description: accountingDocumentLines.description,
      quantity: accountingDocumentLines.quantity,
      unitPriceMinor: accountingDocumentLines.unitPriceMinor,
      discountMinor: accountingDocumentLines.discountMinor,
      lineTotalMinor: accountingDocumentLines.lineTotalMinor,
      currencyCode: accountingDocuments.currencyCode,
      exchangeRatePpm: accountingDocuments.exchangeRatePpm,
      marketExchangeRate: accountingDocuments.marketExchangeRate,
      partnerId: accountingDocuments.partnerId,
      warehouseId: accountingDocuments.warehouseId,
    })
    .from(accountingDocumentLines)
    .innerJoin(
      accountingDocuments,
      eq(accountingDocumentLines.documentId, accountingDocuments.id)
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.type, "purchaseInvoice"),
        eq(accountingDocuments.status, "posted"),
        sql`${accountingDocumentLines.variantId} is not null`
      )
    )
    .orderBy(
      desc(accountingDocuments.postedAt),
      desc(accountingDocumentLines.id)
    )
    .limit(200);
  if (!lines.length) return [];
  const returns = await db
    .select({
      sourceDocumentLineId: accountingDocumentLines.sourceDocumentLineId,
      quantity: sql<number>`coalesce(sum(${accountingDocumentLines.quantity}), 0)`,
    })
    .from(accountingDocumentLines)
    .innerJoin(
      accountingDocuments,
      eq(accountingDocumentLines.documentId, accountingDocuments.id)
    )
    .where(
      and(
        inArray(
          accountingDocumentLines.sourceDocumentLineId,
          lines.map(line => line.id)
        ),
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.type, "purchaseReturn"),
        eq(accountingDocuments.status, "posted")
      )
    )
    .groupBy(accountingDocumentLines.sourceDocumentLineId);
  const returnedByLine = new Map(
    returns.map(row => [row.sourceDocumentLineId, Number(row.quantity)])
  );
  return lines
    .map(line => ({
      ...line,
      availableQuantity: line.quantity - (returnedByLine.get(line.id) ?? 0),
    }))
    .filter(line => line.availableQuantity > 0);
}

export async function listActivePaymentAccounts(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  let activeAccounts = await db
    .select({
      id: accountingPaymentAccounts.id,
      accountId: accountingPaymentAccounts.accountId,
      name: accountingPaymentAccounts.name,
      type: accountingPaymentAccounts.type,
      currencyCode: accountingPaymentAccounts.currencyCode,
      isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
      branchId: accountingPaymentAccounts.branchId,
    })
    .from(accountingPaymentAccounts)
    .where(
      and(
        eq(accountingPaymentAccounts.companyId, company.id),
        eq(accountingPaymentAccounts.isActive, true)
      )
    )
    .orderBy(asc(accountingPaymentAccounts.name));
  if (activeAccounts.length > 0) return activeAccounts;

  const existingAccounts = await db
    .select({
      id: accountingPaymentAccounts.id,
      accountId: accountingPaymentAccounts.accountId,
      name: accountingPaymentAccounts.name,
      type: accountingPaymentAccounts.type,
      currencyCode: accountingPaymentAccounts.currencyCode,
      isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
      branchId: accountingPaymentAccounts.branchId,
      isActive: accountingPaymentAccounts.isActive,
    })
    .from(accountingPaymentAccounts)
    .where(eq(accountingPaymentAccounts.companyId, company.id))
    .orderBy(asc(accountingPaymentAccounts.id));
  const existing = existingAccounts[0];
  if (existing) {
    await db
      .update(accountingPaymentAccounts)
      .set({ isActive: true })
      .where(eq(accountingPaymentAccounts.id, existing.id));
  } else {
    const [cashAccount] = await db
      .select({ id: accountingAccounts.id })
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.companyId, company.id),
          eq(accountingAccounts.code, "1110"),
          eq(accountingAccounts.isActive, true),
          eq(accountingAccounts.acceptsPosting, true)
        )
      )
      .limit(1);
    if (!cashAccount) return [];
    await db.insert(accountingPaymentAccounts).values({
      companyId: company.id,
      accountId: cashAccount.id,
      type: "cash",
      name: "الصندوق الرئيسي",
      currencyCode: "IQD",
      isMultiCurrency: true,
      isActive: true,
    });
  }
  activeAccounts = await db
    .select({
      id: accountingPaymentAccounts.id,
      accountId: accountingPaymentAccounts.accountId,
      name: accountingPaymentAccounts.name,
      type: accountingPaymentAccounts.type,
      currencyCode: accountingPaymentAccounts.currencyCode,
      isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
      branchId: accountingPaymentAccounts.branchId,
    })
    .from(accountingPaymentAccounts)
    .where(
      and(
        eq(accountingPaymentAccounts.companyId, company.id),
        eq(accountingPaymentAccounts.isActive, true)
      )
    )
    .orderBy(asc(accountingPaymentAccounts.name));
  return activeAccounts;
}

export async function listActivePriceLists(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      id: accountingPriceLists.id,
      code: accountingPriceLists.code,
      name: accountingPriceLists.name,
      currencyCode: accountingPriceLists.currencyCode,
      maxDiscountBps: accountingPriceLists.maxDiscountBps,
    })
    .from(accountingPriceLists)
    .where(
      and(
        eq(accountingPriceLists.companyId, company.id),
        eq(accountingPriceLists.isActive, true)
      )
    )
    .orderBy(asc(accountingPriceLists.code));
}

type ManualTaxInput = {
  userId: number;
  rateBps: number;
  documentId?: number;
  startDate?: string;
  endDate?: string;
};

async function calculateManualTaxForCompany(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: ManualTaxInput
) {
  if (
    !Number.isInteger(input.rateBps) ||
    input.rateBps < 0 ||
    input.rateBps > 10_000
  )
    throw new Error("نسبة الضريبة يجب أن تكون بين 0% و100%");
  const hasDocument = Boolean(input.documentId);
  const hasPeriod = Boolean(input.startDate && input.endDate);
  if (hasDocument === hasPeriod)
    throw new Error("اختر فاتورة مرحلة واحدة أو أدخل تاريخ بداية ونهاية للمدة");
  const startAt = input.startDate
    ? new Date(`${input.startDate}T00:00:00.000Z`)
    : null;
  const endAt = input.endDate
    ? new Date(`${input.endDate}T23:59:59.999Z`)
    : null;
  if (
    hasPeriod &&
    (!startAt ||
      !endAt ||
      Number.isNaN(startAt.getTime()) ||
      Number.isNaN(endAt.getTime()) ||
      startAt > endAt)
  )
    throw new Error("مدة احتساب الضريبة غير صالحة");
  const eligibleTypes = [
    "saleInvoice",
    "purchaseInvoice",
    "salesReturn",
    "purchaseReturn",
  ] as const;
  const documents = await db
    .select({
      id: accountingDocuments.id,
      documentNumber: accountingDocuments.documentNumber,
      type: accountingDocuments.type,
      currencyCode: accountingDocuments.currencyCode,
      exchangeRatePpm: accountingDocuments.exchangeRatePpm,
      subtotalMinor: accountingDocuments.subtotalMinor,
      discountMinor: accountingDocuments.discountMinor,
      postedAt: accountingDocuments.postedAt,
    })
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.companyId, companyId),
        eq(accountingDocuments.status, "posted"),
        inArray(accountingDocuments.type, eligibleTypes),
        ...(hasDocument
          ? [eq(accountingDocuments.id, input.documentId!)]
          : [
              gte(accountingDocuments.postedAt, startAt!),
              lte(accountingDocuments.postedAt, endAt!),
            ])
      )
    )
    .orderBy(asc(accountingDocuments.postedAt), asc(accountingDocuments.id));
  if (hasDocument && documents.length === 0)
    throw new Error("الفاتورة المختارة غير مرحلة أو لا تصلح لاحتساب الضريبة");
  const currencySummaries = new Map<
    string,
    {
      currencyCode: string;
      salesNetMinor: number;
      outputTaxMinor: number;
      purchaseNetMinor: number;
      inputTaxMinor: number;
    }
  >();
  let outputTaxUsdMinor = 0;
  let inputTaxUsdMinor = 0;
  const rows = documents.map(document => {
    const netMinor = document.subtotalMinor - document.discountMinor;
    const calculatedTaxMinor = Math.round((netMinor * input.rateBps) / 10_000);
    const calculatedTaxUsdMinor = calculateBaseAmount(
      calculatedTaxMinor,
      document.exchangeRatePpm
    );
    const summary = currencySummaries.get(document.currencyCode) ?? {
      currencyCode: document.currencyCode,
      salesNetMinor: 0,
      outputTaxMinor: 0,
      purchaseNetMinor: 0,
      inputTaxMinor: 0,
    };
    if (document.type === "saleInvoice") {
      summary.salesNetMinor += netMinor;
      summary.outputTaxMinor += calculatedTaxMinor;
      outputTaxUsdMinor += calculatedTaxUsdMinor;
    }
    if (document.type === "salesReturn") {
      summary.salesNetMinor -= netMinor;
      summary.outputTaxMinor -= calculatedTaxMinor;
      outputTaxUsdMinor -= calculatedTaxUsdMinor;
    }
    if (document.type === "purchaseInvoice") {
      summary.purchaseNetMinor += netMinor;
      summary.inputTaxMinor += calculatedTaxMinor;
      inputTaxUsdMinor += calculatedTaxUsdMinor;
    }
    if (document.type === "purchaseReturn") {
      summary.purchaseNetMinor -= netMinor;
      summary.inputTaxMinor -= calculatedTaxMinor;
      inputTaxUsdMinor -= calculatedTaxUsdMinor;
    }
    currencySummaries.set(document.currencyCode, summary);
    return { ...document, netMinor, calculatedTaxMinor, calculatedTaxUsdMinor };
  });
  const result = {
    basis: "operational" as const,
    rateBps: input.rateBps,
    documentCount: rows.length,
    rows,
    currencySummaries: Array.from(currencySummaries.values()).map(summary => ({
      ...summary,
      netTaxMinor: summary.outputTaxMinor - summary.inputTaxMinor,
    })),
    outputTaxUsdMinor,
    inputTaxUsdMinor,
    netTaxPayableUsdMinor: outputTaxUsdMinor - inputTaxUsdMinor,
  };
  await db.insert(accountingAuditEvents).values({
    entityType: "manualTaxCalculation",
    entityId: input.documentId ?? 0,
    action: "calculated",
    afterJson: JSON.stringify({
      rateBps: input.rateBps,
      documentId: input.documentId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      documentCount: result.documentCount,
      outputTaxUsdMinor,
      inputTaxUsdMinor,
      netTaxPayableUsdMinor: result.netTaxPayableUsdMinor,
    }),
    performedBy: input.userId,
  });
  return result;
}

export async function calculateManualTaxInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  input: ManualTaxInput & { companyId: number }
) {
  return calculateManualTaxForCompany(tx, input.companyId, input);
}

export async function calculateManualTax(input: ManualTaxInput) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return calculateManualTaxForCompany(db, company.id, input);
}

export async function listPriceListItems(userId: number, priceListId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const [priceList] = await db
    .select({
      id: accountingPriceLists.id,
      name: accountingPriceLists.name,
      code: accountingPriceLists.code,
      currencyCode: accountingPriceLists.currencyCode,
      isActive: accountingPriceLists.isActive,
    })
    .from(accountingPriceLists)
    .where(
      and(
        eq(accountingPriceLists.id, priceListId),
        eq(accountingPriceLists.companyId, company.id)
      )
    )
    .limit(1);
  if (!priceList) throw new Error("قائمة الأسعار لا تتبع الشركة الحالية");
  const items = await db
    .select({
      id: accountingPriceListItems.id,
      variantId: accountingPriceListItems.variantId,
      unitPriceMinor: accountingPriceListItems.unitPriceMinor,
      itemName: inventoryItems.name,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      barcode: inventoryVariants.barcode,
    })
    .from(accountingPriceListItems)
    .innerJoin(
      inventoryVariants,
      eq(accountingPriceListItems.variantId, inventoryVariants.id)
    )
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id))
    .where(eq(accountingPriceListItems.priceListId, priceList.id))
    .orderBy(asc(inventoryItems.name), asc(accountingPriceListItems.id));
  const tiers = items.length
    ? await db
        .select()
        .from(accountingPriceListItemTiers)
        .where(
          inArray(
            accountingPriceListItemTiers.priceListItemId,
            items.map(item => item.id)
          )
        )
        .orderBy(asc(accountingPriceListItemTiers.minimumQuantity))
    : [];
  const tiersByItem = new Map<
    number,
    Array<{ id: number; minimumQuantity: number; unitPriceMinor: number }>
  >();
  for (const tier of tiers)
    tiersByItem.set(tier.priceListItemId, [
      ...(tiersByItem.get(tier.priceListItemId) ?? []),
      {
        id: tier.id,
        minimumQuantity: tier.minimumQuantity,
        unitPriceMinor: tier.unitPriceMinor,
      },
    ]);
  return {
    priceList,
    items: items.map(item => ({
      ...item,
      tiers: tiersByItem.get(item.id) ?? [],
    })),
  };
}

export async function upsertPriceListItem(input: {
  userId: number;
  priceListId: number;
  variantId: number;
  unitPriceMinor: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0)
    throw new Error("سعر الصنف في القائمة غير صحيح");
  return db.transaction(async tx => {
    const [priceList] = await tx
      .select()
      .from(accountingPriceLists)
      .where(
        and(
          eq(accountingPriceLists.id, input.priceListId),
          eq(accountingPriceLists.companyId, company.id),
          eq(accountingPriceLists.isActive, true)
        )
      )
      .limit(1);
    if (!priceList)
      throw new Error("قائمة الأسعار غير فعالة أو لا تتبع الشركة الحالية");
    const [variant] = await tx
      .select({ id: inventoryVariants.id })
      .from(inventoryVariants)
      .where(eq(inventoryVariants.id, input.variantId))
      .limit(1);
    if (!variant) throw new Error("الصنف المحدد غير موجود");
    const [before] = await tx
      .select()
      .from(accountingPriceListItems)
      .where(
        and(
          eq(accountingPriceListItems.priceListId, priceList.id),
          eq(accountingPriceListItems.variantId, variant.id)
        )
      )
      .limit(1);
    await tx
      .insert(accountingPriceListItems)
      .values({
        priceListId: priceList.id,
        variantId: variant.id,
        unitPriceMinor: input.unitPriceMinor,
      })
      .onDuplicateKeyUpdate({ set: { unitPriceMinor: input.unitPriceMinor } });
    const [saved] = await tx
      .select()
      .from(accountingPriceListItems)
      .where(
        and(
          eq(accountingPriceListItems.priceListId, priceList.id),
          eq(accountingPriceListItems.variantId, variant.id)
        )
      )
      .limit(1);
    await tx.insert(accountingAuditEvents).values({
      entityType: "priceListItem",
      entityId: saved!.id,
      action: before ? "updated" : "created",
      beforeJson: before
        ? JSON.stringify({ unitPriceMinor: before.unitPriceMinor })
        : null,
      afterJson: JSON.stringify({
        priceListId: priceList.id,
        variantId: variant.id,
        unitPriceMinor: input.unitPriceMinor,
        currencyCode: priceList.currencyCode,
      }),
      performedBy: input.userId,
    });
    return saved!;
  });
}

export async function upsertPriceListItemTier(input: {
  userId: number;
  priceListId: number;
  variantId: number;
  minimumQuantity: number;
  unitPriceMinor: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  if (!Number.isInteger(input.minimumQuantity) || input.minimumQuantity < 2)
    throw new Error(
      "يجب أن يبدأ مستوى الكمية من وحدتين أو أكثر؛ سعر الأساس يغطي الوحدة الأولى"
    );
  if (!Number.isInteger(input.unitPriceMinor) || input.unitPriceMinor < 0)
    throw new Error("سعر مستوى الكمية غير صحيح");
  return db.transaction(async tx => {
    const [priceList] = await tx
      .select()
      .from(accountingPriceLists)
      .where(
        and(
          eq(accountingPriceLists.id, input.priceListId),
          eq(accountingPriceLists.companyId, company.id),
          eq(accountingPriceLists.isActive, true)
        )
      )
      .limit(1);
    if (!priceList)
      throw new Error("قائمة الأسعار غير فعالة أو لا تتبع الشركة الحالية");
    const [item] = await tx
      .select()
      .from(accountingPriceListItems)
      .where(
        and(
          eq(accountingPriceListItems.priceListId, priceList.id),
          eq(accountingPriceListItems.variantId, input.variantId)
        )
      )
      .limit(1);
    if (!item)
      throw new Error("احفظ سعر الأساس للصنف أولاً قبل إضافة مستوى كمية");
    const [before] = await tx
      .select()
      .from(accountingPriceListItemTiers)
      .where(
        and(
          eq(accountingPriceListItemTiers.priceListItemId, item.id),
          eq(
            accountingPriceListItemTiers.minimumQuantity,
            input.minimumQuantity
          )
        )
      )
      .limit(1);
    await tx
      .insert(accountingPriceListItemTiers)
      .values({
        priceListItemId: item.id,
        minimumQuantity: input.minimumQuantity,
        unitPriceMinor: input.unitPriceMinor,
      })
      .onDuplicateKeyUpdate({ set: { unitPriceMinor: input.unitPriceMinor } });
    const [saved] = await tx
      .select()
      .from(accountingPriceListItemTiers)
      .where(
        and(
          eq(accountingPriceListItemTiers.priceListItemId, item.id),
          eq(
            accountingPriceListItemTiers.minimumQuantity,
            input.minimumQuantity
          )
        )
      )
      .limit(1);
    await tx.insert(accountingAuditEvents).values({
      entityType: "priceListItemTier",
      entityId: saved!.id,
      action: before ? "updated" : "created",
      beforeJson: before
        ? JSON.stringify({ unitPriceMinor: before.unitPriceMinor })
        : null,
      afterJson: JSON.stringify({
        priceListId: priceList.id,
        variantId: item.variantId,
        minimumQuantity: input.minimumQuantity,
        unitPriceMinor: input.unitPriceMinor,
        currencyCode: priceList.currencyCode,
      }),
      performedBy: input.userId,
    });
    return saved!;
  });
}

async function applyPriceListItemPricesInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  priceListId: number | undefined,
  type: DocumentCreateInput["type"],
  lines: DocumentCreateInput["lines"]
) {
  if (!priceListId || type !== "saleInvoice") return lines;
  const variantIds = Array.from(
    new Set(lines.flatMap(line => (line.variantId ? [line.variantId] : [])))
  );
  if (!variantIds.length) return lines;
  const prices = await tx
    .select({
      id: accountingPriceListItems.id,
      variantId: accountingPriceListItems.variantId,
      unitPriceMinor: accountingPriceListItems.unitPriceMinor,
    })
    .from(accountingPriceListItems)
    .where(
      and(
        eq(accountingPriceListItems.priceListId, priceListId),
        inArray(accountingPriceListItems.variantId, variantIds)
      )
    );
  const tiers = prices.length
    ? await tx
        .select()
        .from(accountingPriceListItemTiers)
        .where(
          inArray(
            accountingPriceListItemTiers.priceListItemId,
            prices.map(item => item.id)
          )
        )
        .orderBy(desc(accountingPriceListItemTiers.minimumQuantity))
    : [];
  const priceByVariant = new Map(
    prices.map(item => [
      item.variantId,
      { id: item.id, base: item.unitPriceMinor },
    ])
  );
  const tiersByItem = new Map<
    number,
    Array<{ minimumQuantity: number; unitPriceMinor: number }>
  >();
  for (const tier of tiers)
    tiersByItem.set(tier.priceListItemId, [
      ...(tiersByItem.get(tier.priceListItemId) ?? []),
      {
        minimumQuantity: tier.minimumQuantity,
        unitPriceMinor: tier.unitPriceMinor,
      },
    ]);
  return lines.map(line => {
    const price = line.variantId
      ? priceByVariant.get(line.variantId)
      : undefined;
    if (!price) return line;
    const tier = (tiersByItem.get(price.id) ?? []).find(
      candidate => line.quantity >= candidate.minimumQuantity
    );
    return { ...line, unitPriceMinor: tier?.unitPriceMinor ?? price.base };
  });
}

export async function listActiveAccountingWarehouses(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      id: accountingWarehouses.id,
      branchId: accountingBranches.id,
      branchName: accountingBranches.name,
      code: accountingWarehouses.code,
      name: accountingWarehouses.name,
    })
    .from(accountingWarehouses)
    .innerJoin(
      accountingBranches,
      eq(accountingWarehouses.branchId, accountingBranches.id)
    )
    .where(
      and(
        eq(accountingBranches.companyId, company.id),
        eq(accountingWarehouses.isActive, true)
      )
    )
    .orderBy(asc(accountingBranches.code), asc(accountingWarehouses.code));
}

export async function listWarehouseVariantBalances(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      warehouseId: accountingWarehouses.id,
      warehouseName: accountingWarehouses.name,
      branchName: accountingBranches.name,
      itemName: inventoryItems.name,
      variantId: inventoryVariants.id,
      color: inventoryVariants.color,
      size: inventoryVariants.size,
      quantity: accountingWarehouseVariantBalances.quantity,
    })
    .from(accountingWarehouseVariantBalances)
    .innerJoin(
      accountingWarehouses,
      eq(
        accountingWarehouseVariantBalances.warehouseId,
        accountingWarehouses.id
      )
    )
    .innerJoin(
      accountingBranches,
      eq(accountingWarehouses.branchId, accountingBranches.id)
    )
    .innerJoin(
      inventoryVariants,
      eq(accountingWarehouseVariantBalances.variantId, inventoryVariants.id)
    )
    .innerJoin(inventoryItems, eq(inventoryVariants.itemId, inventoryItems.id))
    .where(eq(accountingBranches.companyId, company.id))
    .orderBy(
      asc(accountingBranches.code),
      asc(accountingWarehouses.code),
      asc(inventoryItems.name)
    );
}

export async function listApprovals(userId: number) {
  const db = await dbOrThrow();
  await setupContext(userId);
  return db
    .select()
    .from(accountingApprovals)
    .orderBy(desc(accountingApprovals.createdAt))
    .limit(100);
}

async function nextDocumentNumber(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  branchId: number,
  type: string
) {
  const prefix = `${type.slice(0, 3).toUpperCase()}-${branchId}`;
  await tx.execute(sql`INSERT INTO accounting_document_sequences (branchId, documentType, prefix, nextNumber)
    VALUES (${branchId}, ${type}, ${prefix}, 2)
    ON DUPLICATE KEY UPDATE nextNumber = nextNumber + 1`);
  const [sequence] = await tx
    .select()
    .from(accountingDocumentSequences)
    .where(
      and(
        eq(accountingDocumentSequences.branchId, branchId),
        eq(accountingDocumentSequences.documentType, type)
      )
    )
    .limit(1);
  if (!sequence) throw new Error("تعذر تخصيص رقم المستند");
  return `${sequence.prefix}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}

async function changeWarehouseVariantBalance(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  warehouseId: number,
  variantId: number,
  change: number
) {
  if (change === 0) return;
  if (change < 0) {
    const updated = await tx
      .update(accountingWarehouseVariantBalances)
      .set({
        quantity: sql`${accountingWarehouseVariantBalances.quantity} + ${change}`,
      })
      .where(
        and(
          eq(accountingWarehouseVariantBalances.warehouseId, warehouseId),
          eq(accountingWarehouseVariantBalances.variantId, variantId),
          gte(accountingWarehouseVariantBalances.quantity, -change)
        )
      );
    if (updated[0].affectedRows !== 1)
      throw new Error("رصيد الصنف غير كافٍ في مخزن المصدر");
    return;
  }
  await tx.execute(sql`INSERT INTO accounting_warehouse_variant_balances (warehouseId, variantId, quantity)
    VALUES (${warehouseId}, ${variantId}, ${change})
    ON DUPLICATE KEY UPDATE quantity = quantity + ${change}`);
}

type DocumentCreateInput = {
  userId: number;
  type:
    | "saleInvoice"
    | "purchaseInvoice"
    | "salesReturn"
    | "purchaseReturn"
    | "receipt"
    | "payment"
    | "stockTransfer";
  partnerId?: number;
  branchId?: number;
  warehouseId?: number;
  paymentAccountId?: number;
  destinationWarehouseId?: number;
  costCenterId?: number;
  priceListId?: number;
  currencyCode: string;
  exchangeRatePpm: number;
  marketExchangeRate?: number;
  dueAt?: Date;
  chequeNumber?: string;
  note?: string;
  settlements?: Array<{ targetDocumentId: number; amountMinor: number }>;
  autoPost?: boolean;
  lines: Array<{
    variantId?: number;
    sourceDocumentLineId?: number;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    discountMinor?: number;
  }>;
};
type DocumentDraftUpdateInput = Omit<
  DocumentCreateInput,
  "type" | "branchId"
> & { documentId: number; allowHistoricalEdit?: boolean };

async function validateSettlementTargetsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  document: {
    id?: number;
    type: string;
    partnerId: number | null;
    currencyCode: string;
    totalMinor: number;
  },
  settlements: Array<{ targetDocumentId: number; amountMinor: number }>,
  checkOutstanding: boolean
) {
  if (!settlements.length) return;
  if (document.type !== "receipt" && document.type !== "payment")
    throw new Error("تخصيص التسوية متاح لسندات القبض والصرف فقط");
  if (!document.partnerId)
    throw new Error("يتطلب تخصيص التسوية اختيار العميل أو المورد");
  const allocationTotal = settlements.reduce(
    (total, settlement) => total + settlement.amountMinor,
    0
  );
  if (allocationTotal > document.totalMinor)
    throw new Error("إجمالي التخصيصات يتجاوز قيمة سند القبض أو الصرف");
  if (
    settlements.some(
      settlement =>
        !Number.isInteger(settlement.amountMinor) || settlement.amountMinor <= 0
    )
  )
    throw new Error("قيمة تخصيص التسوية يجب أن تكون موجبة");
  if (
    new Set(settlements.map(settlement => settlement.targetDocumentId)).size !==
    settlements.length
  )
    throw new Error("لا يمكن تخصيص السند للفواتير نفسها أكثر من مرة");
  const targets = await tx
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.companyId, companyId),
        inArray(
          accountingDocuments.id,
          settlements.map(settlement => settlement.targetDocumentId)
        )
      )
    );
  if (targets.length !== settlements.length)
    throw new Error("إحدى فواتير التسوية غير صالحة");
  const expectedType =
    document.type === "receipt" ? "saleInvoice" : "purchaseInvoice";
  for (const settlement of settlements) {
    const target = targets.find(row => row.id === settlement.targetDocumentId);
    if (
      !target ||
      target.type !== expectedType ||
      target.status !== "posted" ||
      target.partnerId !== document.partnerId ||
      target.currencyCode !== document.currencyCode
    )
      throw new Error("فاتورة التسوية يجب أن تكون مرحلة ومن نفس الطرف والعملة");
    if (checkOutstanding) {
      const allocated = await tx
        .select({
          total: sql<number>`coalesce(sum(${accountingDocumentSettlements.amountMinor}), 0)`,
        })
        .from(accountingDocumentSettlements)
        .innerJoin(
          accountingDocuments,
          eq(
            accountingDocumentSettlements.settlementDocumentId,
            accountingDocuments.id
          )
        )
        .where(
          and(
            eq(accountingDocumentSettlements.targetDocumentId, target.id),
            eq(accountingDocuments.status, "posted")
          )
        );
      if (
        Number(allocated[0]?.total ?? 0) + settlement.amountMinor >
        target.totalMinor
      )
        throw new Error("تخصيص التسوية يتجاوز الرصيد المتبقي للفاتورة");
    }
  }
}

export async function createAccountingDocumentInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  input: DocumentCreateInput
) {
  const branchRows = input.branchId
    ? await tx
        .select()
        .from(accountingBranches)
        .where(
          and(
            eq(accountingBranches.id, input.branchId),
            eq(accountingBranches.companyId, context.company.id)
          )
        )
        .limit(1)
    : [context.branch];
  const branch = branchRows[0];
  if (!branch) throw new Error("الفرع المحدد غير صالح");
  const warehouseRows = await tx
    .select()
    .from(accountingWarehouses)
    .where(eq(accountingWarehouses.branchId, branch.id))
    .orderBy(asc(accountingWarehouses.id))
    .limit(1);
  const sourceWarehouseRows = input.warehouseId
    ? await tx
        .select({
          id: accountingWarehouses.id,
          branchId: accountingBranches.id,
        })
        .from(accountingWarehouses)
        .innerJoin(
          accountingBranches,
          eq(accountingWarehouses.branchId, accountingBranches.id)
        )
        .where(
          and(
            eq(accountingWarehouses.id, input.warehouseId),
            eq(accountingBranches.companyId, context.company.id),
            eq(accountingWarehouses.isActive, true)
          )
        )
        .limit(1)
    : warehouseRows.map(warehouse => ({
        id: warehouse.id,
        branchId: branch.id,
      }));
  const sourceWarehouse = sourceWarehouseRows[0];
  const destinationWarehouseRows = input.destinationWarehouseId
    ? await tx
        .select({ id: accountingWarehouses.id })
        .from(accountingWarehouses)
        .innerJoin(
          accountingBranches,
          eq(accountingWarehouses.branchId, accountingBranches.id)
        )
        .where(
          and(
            eq(accountingWarehouses.id, input.destinationWarehouseId),
            eq(accountingBranches.companyId, context.company.id),
            eq(accountingWarehouses.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (
    input.type === "stockTransfer" &&
    (!sourceWarehouse ||
      !destinationWarehouseRows[0] ||
      destinationWarehouseRows[0].id === sourceWarehouse.id)
  )
    throw new Error("اختر مخزناً وجهة مختلفاً وفعالاً للتحويل");
  const paymentAccountRows = input.paymentAccountId
    ? await tx
        .select()
        .from(accountingPaymentAccounts)
        .where(
          and(
            eq(accountingPaymentAccounts.id, input.paymentAccountId),
            eq(accountingPaymentAccounts.companyId, context.company.id),
            eq(accountingPaymentAccounts.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (
    (input.type === "receipt" || input.type === "payment") &&
    !paymentAccountRows[0]
  )
    throw new Error("يجب اختيار حساب دفع فعال لسند القبض أو الصرف");
  if (
    paymentAccountRows[0] &&
    !paymentAccountRows[0].isMultiCurrency &&
    paymentAccountRows[0].currencyCode !== input.currencyCode
  )
    throw new Error("عملة حساب الدفع يجب أن تطابق عملة المستند");
  const chequeNumber = input.chequeNumber?.trim() || null;
  if (paymentAccountRows[0]?.type === "cheque" && !chequeNumber)
    throw new Error("رقم الشيك مطلوب عند اختيار دفتر شيكات");
  if (chequeNumber && paymentAccountRows[0]?.type !== "cheque")
    throw new Error("رقم الشيك متاح فقط عند اختيار دفتر شيكات");
  const costCenterRows = input.costCenterId
    ? await tx
        .select({ id: accountingCostCenters.id })
        .from(accountingCostCenters)
        .where(
          and(
            eq(accountingCostCenters.id, input.costCenterId),
            eq(accountingCostCenters.companyId, context.company.id),
            eq(accountingCostCenters.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (input.costCenterId && !costCenterRows[0])
    throw new Error("مركز التكلفة غير فعال أو لا يتبع الشركة الحالية");
  const effectiveBranchId = sourceWarehouse?.branchId ?? branch.id;
  const documentNumber = await nextDocumentNumber(
    tx as never,
    effectiveBranchId,
    input.type
  );
  const priceList = await tx
    .select()
    .from(accountingPriceLists)
    .where(
      and(
        eq(accountingPriceLists.companyId, context.company.id),
        eq(accountingPriceLists.currencyCode, input.currencyCode),
        eq(accountingPriceLists.isActive, true),
        ...(input.priceListId
          ? [eq(accountingPriceLists.id, input.priceListId)]
          : [])
      )
    )
    .orderBy(asc(accountingPriceLists.maxDiscountBps))
    .limit(1);
  if (input.priceListId && !priceList[0])
    throw new Error("قائمة الأسعار غير فعالة أو لا تطابق عملة المستند");
  const pricedLines = await applyPriceListItemPricesInTransaction(
    tx,
    priceList[0]?.id,
    input.type,
    input.lines
  );
  const totals = calculateDocumentTotals(pricedLines);
  const exchangeRatePpm = normalizeExchangeRatePpm(
    input.currencyCode,
    input.exchangeRatePpm
  );
  assertBaseAmountRepresentable(totals.totalMinor, exchangeRatePpm);
  await validateSettlementTargetsInTransaction(
    tx as never,
    context.company.id,
    {
      type: input.type,
      partnerId: input.partnerId ?? null,
      currencyCode: input.currencyCode,
      totalMinor: totals.totalMinor,
    },
    input.settlements ?? [],
    true
  );
  const requiresDiscountApproval = Boolean(
    totals.discountMinor > 0 &&
      (priceList[0]
        ? exceedsDiscountLimit(
            totals.subtotalMinor,
            totals.discountMinor,
            priceList[0].maxDiscountBps
          )
        : totals.discountMinor * 10000 > totals.subtotalMinor * 500)
  );
  // The public accounting UI opts into immediate posting. Internal imports and
  // low-level callers retain draft semantics unless autoPost is explicitly set.
  const status = input.autoPost
    ? ("pendingApproval" as const)
    : requiresDiscountApproval
      ? ("pendingApproval" as const)
      : ("draft" as const);
  const result = await tx.insert(accountingDocuments).values({
    companyId: context.company.id,
    branchId: effectiveBranchId,
    warehouseId: sourceWarehouse?.id ?? null,
    fiscalPeriodId: context.period.id,
    documentNumber,
    type: input.type,
    partnerId: input.partnerId ?? null,
    paymentAccountId: paymentAccountRows[0]?.id ?? null,
    destinationWarehouseId: destinationWarehouseRows[0]?.id ?? null,
    priceListId: priceList[0]?.id ?? null,
    costCenterId: costCenterRows[0]?.id ?? null,
    currencyCode: input.currencyCode,
    exchangeRatePpm,
    marketExchangeRate:
      input.marketExchangeRate != null
        ? String(input.marketExchangeRate)
        : input.currencyCode === "USD"
          ? "1"
          : null,
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxRateBps: 0,
    outputTaxAccountId: null,
    inputTaxAccountId: null,
    taxMinor: 0,
    totalMinor: totals.totalMinor,
    dueAt: input.dueAt ?? null,
    chequeNumber,
    note: input.note ?? null,
    status,
    createdBy: input.userId,
  });
  const documentId = Number(result[0].insertId);
  for (const line of pricedLines) {
    const gross = line.quantity * line.unitPriceMinor;
    await tx.insert(accountingDocumentLines).values({
      documentId,
      variantId: line.variantId ?? null,
      sourceDocumentLineId: line.sourceDocumentLineId ?? null,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor: line.discountMinor ?? 0,
      lineTotalMinor: gross - (line.discountMinor ?? 0),
    });
  }
  if (input.settlements?.length)
    await tx.insert(accountingDocumentSettlements).values(
      input.settlements.map(settlement => ({
        settlementDocumentId: documentId,
        targetDocumentId: settlement.targetDocumentId,
        amountMinor: settlement.amountMinor,
      }))
    );
  await tx.insert(accountingAuditEvents).values({
    entityType: "document",
    entityId: documentId,
    action: "created",
    afterJson: JSON.stringify({
      type: input.type,
      documentNumber,
      costCenterId: costCenterRows[0]?.id ?? null,
      totals,
    }),
    performedBy: input.userId,
  });
  if (requiresDiscountApproval && !input.autoPost)
    await tx.insert(accountingApprovals).values({
      entityType: "document",
      entityId: documentId,
      action: "discountOverride",
      requestedBy: input.userId,
      reason: `خصم ${totals.discountMinor} يتجاوز حد قائمة الأسعار`,
    });
  if (!input.autoPost)
    return { id: documentId, documentNumber, status };
  const posted = await approveAndPostDocumentInTransaction(
    tx,
    context,
    documentId,
    input.userId,
    true
  );
  return { id: documentId, documentNumber, status: posted.status };
}

export async function createAccountingDocument(input: DocumentCreateInput) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    createAccountingDocumentInTransaction(tx as never, context, input)
  );
}

async function replacePostedDocumentInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  document: typeof accountingDocuments.$inferSelect,
  input: DocumentDraftUpdateInput & { allowHistoricalEdit: true }
) {
  if (context.period.status !== "open")
    throw new Error("الفترة المالية غير مفتوحة لتعديل المستند");
  if (document.type === "receipt" || document.type === "payment") {
    const cheque = await tx
      .select({ id: accountingCheques.id, status: accountingCheques.status })
      .from(accountingCheques)
      .where(eq(accountingCheques.sourceDocumentId, document.id))
      .limit(1);
    if (cheque[0])
      throw new Error("لا يمكن تعديل سند مرتبط بشيك؛ ألغِ الشيك أولاً");
  }

  const oldJournal = await tx
    .select()
    .from(accountingJournalEntries)
    .where(
      and(
        eq(accountingJournalEntries.sourceType, "document"),
        eq(accountingJournalEntries.sourceId, document.id),
        eq(accountingJournalEntries.status, "posted")
      )
    )
    .limit(1);
  if (oldJournal[0]) {
    const oldLines = await tx
      .select()
      .from(accountingJournalLines)
      .where(eq(accountingJournalLines.journalEntryId, oldJournal[0].id));
    const reversal = await tx.insert(accountingJournalEntries).values({
      companyId: oldJournal[0].companyId,
      branchId: oldJournal[0].branchId,
      fiscalPeriodId: oldJournal[0].fiscalPeriodId,
      entryNumber: `R-${document.documentNumber}`.slice(0, 50),
      entryDate: new Date(),
      sourceType: "documentReversal",
      sourceId: document.id,
      status: "posted",
      memo: `عكس المستند المعدل ${document.documentNumber}`,
      postedBy: input.userId,
      postedAt: new Date(),
      createdBy: input.userId,
    });
    const reversalId = Number(reversal[0].insertId);
    await tx.insert(accountingJournalLines).values(
      oldLines.map(line => ({
        journalEntryId: reversalId,
        accountId: line.accountId,
        costCenterId: line.costCenterId,
        currencyCode: line.currencyCode,
        exchangeRatePpm: line.exchangeRatePpm,
        debitMinor: line.creditMinor,
        creditMinor: line.debitMinor,
        baseDebitMinor: line.baseCreditMinor,
        baseCreditMinor: line.baseDebitMinor,
      }))
    );
    await tx
      .update(accountingJournalEntries)
      .set({ status: "reversed" })
      .where(eq(accountingJournalEntries.id, oldJournal[0].id));
  }

  const oldLines = await tx
    .select()
    .from(accountingDocumentLines)
    .where(eq(accountingDocumentLines.documentId, document.id));
  const inbound = document.type === "purchaseInvoice" || document.type === "salesReturn";
  const outbound = document.type === "saleInvoice" || document.type === "purchaseReturn";
  if (document.type === "stockTransfer") {
    if (!document.warehouseId || !document.destinationWarehouseId)
      throw new Error("بيانات التحويل المخزني القديم غير مكتملة");
    for (const line of oldLines) {
      if (!line.variantId) continue;
      await changeWarehouseVariantBalance(tx as never, document.warehouseId, line.variantId, line.quantity);
      await changeWarehouseVariantBalance(tx as never, document.destinationWarehouseId, line.variantId, -line.quantity);
      await tx.insert(inventoryMovements).values([
        { variantId: line.variantId, type: "in", quantity: line.quantity, reason: `عكس تعديل ${document.documentNumber}`, note: document.note, performedBy: input.userId },
        { variantId: line.variantId, type: "out", quantity: line.quantity, reason: `عكس تعديل ${document.documentNumber}`, note: document.note, performedBy: input.userId },
      ]);
    }
  } else if (inbound || outbound) {
    if (!document.warehouseId) throw new Error("لا يوجد مخزن مرتبط بالمستند القديم");
    for (const line of oldLines) {
      if (!line.variantId) continue;
      const [variant] = await tx.select().from(inventoryVariants).where(eq(inventoryVariants.id, line.variantId)).limit(1);
      if (!variant) throw new Error("أحد أصناف المستند القديم غير موجود");
      const unitValue = line.unitCostUsdMinor ?? Math.round(calculateBaseAmount(line.lineTotalMinor, normalizeExchangeRatePpm(document.currencyCode, document.exchangeRatePpm)) / Math.max(1, line.quantity));
      const valueDelta = unitValue * line.quantity;
      if (inbound) {
        await changeWarehouseVariantBalance(tx as never, document.warehouseId, line.variantId, -line.quantity);
        if (variant.stockQuantity < line.quantity) throw new Error("لا يمكن تعديل الفاتورة: الكمية القديمة استُهلكت من المخزن");
        const nextQuantity = variant.stockQuantity - line.quantity;
        const nextValue = Math.max(0, variant.inventoryValueUsdMinor - valueDelta);
        await tx.update(inventoryVariants).set({ stockQuantity: nextQuantity, inventoryValueUsdMinor: nextValue, averageCostUsdMinor: nextQuantity ? Math.round(nextValue / nextQuantity) : 0 }).where(eq(inventoryVariants.id, variant.id));
        await tx.insert(inventoryMovements).values({ variantId: line.variantId, type: "out", quantity: line.quantity, reason: `عكس تعديل ${document.documentNumber}`, note: document.note, performedBy: input.userId });
      } else {
        await changeWarehouseVariantBalance(tx as never, document.warehouseId, line.variantId, line.quantity);
        const nextQuantity = variant.stockQuantity + line.quantity;
        const nextValue = variant.inventoryValueUsdMinor + valueDelta;
        await tx.update(inventoryVariants).set({ stockQuantity: nextQuantity, inventoryValueUsdMinor: nextValue, averageCostUsdMinor: nextQuantity ? Math.round(nextValue / nextQuantity) : 0 }).where(eq(inventoryVariants.id, variant.id));
        await tx.insert(inventoryMovements).values({ variantId: line.variantId, type: "in", quantity: line.quantity, reason: `عكس تعديل ${document.documentNumber}`, note: document.note, performedBy: input.userId });
      }
    }
  }
  await tx.update(accountingDocuments).set({ status: "cancelled" }).where(eq(accountingDocuments.id, document.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "document",
    entityId: document.id,
    action: "editedPosted",
    beforeJson: JSON.stringify({ documentNumber: document.documentNumber, status: document.status, totalMinor: document.totalMinor }),
    afterJson: JSON.stringify({ replacement: true }),
    reason: "تعديل مستند مرحّل عبر عكس القيد وإنشاء مستند بديل",
    performedBy: input.userId,
  });
  const replacement = await createAccountingDocumentInTransaction(tx, context, {
    userId: input.userId,
    autoPost: true,
    type: document.type,
    branchId: document.branchId,
    partnerId: input.partnerId,
    warehouseId: input.warehouseId,
    paymentAccountId: input.paymentAccountId,
    destinationWarehouseId: input.destinationWarehouseId,
    costCenterId: input.costCenterId,
    priceListId: input.priceListId,
    settlements: input.settlements,
    dueAt: input.dueAt,
    chequeNumber: input.chequeNumber,
    currencyCode: input.currencyCode,
    exchangeRatePpm: input.exchangeRatePpm,
    marketExchangeRate: input.marketExchangeRate,
    note: input.note,
    lines: input.lines,
  });
  return replacement;
}

export async function updateAccountingDocumentDraftInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  input: DocumentDraftUpdateInput & { allowHistoricalEdit?: boolean }
) {
  const [document] = await tx
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.id, input.documentId),
        eq(accountingDocuments.companyId, context.company.id)
      )
    )
    .limit(1);
  if (!document) throw new Error("المستند غير موجود");
  if (document.status === "posted") {
    if (!input.allowHistoricalEdit)
      throw new Error("تعديل المستند المرحّل يحتاج صلاحية تعديل المستندات");
    return replacePostedDocumentInTransaction(tx, context, document, input as DocumentDraftUpdateInput & { allowHistoricalEdit: true });
  }
  if (document.status !== "draft")
    throw new Error("لا يمكن تعديل إلا مستند مسودة أو مستند مرحّل بصلاحية خاصة");
  if (!input.allowHistoricalEdit)
    assertDocumentSubmitter(document.createdBy, input.userId);
  if (
    (!input.allowHistoricalEdit &&
      document.fiscalPeriodId !== context.period.id) ||
    context.period.status !== "open"
  )
    throw new Error("الفترة المالية للمسودة غير مفتوحة للتعديل");
  const [branch] = await tx
    .select()
    .from(accountingBranches)
    .where(
      and(
        eq(accountingBranches.id, document.branchId),
        eq(accountingBranches.companyId, context.company.id),
        eq(accountingBranches.isActive, true)
      )
    )
    .limit(1);
  if (!branch) throw new Error("فرع المسودة لم يعد نشطاً أو لا يتبع الشركة");
  const warehouseRows = await tx
    .select()
    .from(accountingWarehouses)
    .where(eq(accountingWarehouses.branchId, branch.id))
    .orderBy(asc(accountingWarehouses.id))
    .limit(1);
  const sourceWarehouseRows = input.warehouseId
    ? await tx
        .select({
          id: accountingWarehouses.id,
          branchId: accountingBranches.id,
        })
        .from(accountingWarehouses)
        .innerJoin(
          accountingBranches,
          eq(accountingWarehouses.branchId, accountingBranches.id)
        )
        .where(
          and(
            eq(accountingWarehouses.id, input.warehouseId),
            eq(accountingBranches.companyId, context.company.id),
            eq(accountingWarehouses.isActive, true)
          )
        )
        .limit(1)
    : document.warehouseId
      ? await tx
          .select({
            id: accountingWarehouses.id,
            branchId: accountingBranches.id,
          })
          .from(accountingWarehouses)
          .innerJoin(
            accountingBranches,
            eq(accountingWarehouses.branchId, accountingBranches.id)
          )
          .where(
            and(
              eq(accountingWarehouses.id, document.warehouseId),
              eq(accountingBranches.companyId, context.company.id),
              eq(accountingWarehouses.isActive, true)
            )
          )
          .limit(1)
      : warehouseRows.map(warehouse => ({
          id: warehouse.id,
          branchId: branch.id,
        }));
  const sourceWarehouse = sourceWarehouseRows[0];
  const destinationWarehouseRows = input.destinationWarehouseId
    ? await tx
        .select({ id: accountingWarehouses.id })
        .from(accountingWarehouses)
        .innerJoin(
          accountingBranches,
          eq(accountingWarehouses.branchId, accountingBranches.id)
        )
        .where(
          and(
            eq(accountingWarehouses.id, input.destinationWarehouseId),
            eq(accountingBranches.companyId, context.company.id),
            eq(accountingWarehouses.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (
    document.type === "stockTransfer" &&
    (!sourceWarehouse ||
      !destinationWarehouseRows[0] ||
      destinationWarehouseRows[0].id === sourceWarehouse.id)
  )
    throw new Error("اختر مخزناً وجهة مختلفاً وفعالاً للتحويل");
  const paymentAccountRows = input.paymentAccountId
    ? await tx
        .select()
        .from(accountingPaymentAccounts)
        .where(
          and(
            eq(accountingPaymentAccounts.id, input.paymentAccountId),
            eq(accountingPaymentAccounts.companyId, context.company.id),
            eq(accountingPaymentAccounts.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (
    (document.type === "receipt" || document.type === "payment") &&
    !paymentAccountRows[0]
  )
    throw new Error("يجب اختيار حساب دفع فعال لسند القبض أو الصرف");
  if (
    paymentAccountRows[0] &&
    !paymentAccountRows[0].isMultiCurrency &&
    paymentAccountRows[0].currencyCode !== input.currencyCode
  )
    throw new Error("عملة حساب الدفع يجب أن تطابق عملة المستند");
  const chequeNumber = input.chequeNumber?.trim() || null;
  if (paymentAccountRows[0]?.type === "cheque" && !chequeNumber)
    throw new Error("رقم الشيك مطلوب عند اختيار دفتر شيكات");
  if (chequeNumber && paymentAccountRows[0]?.type !== "cheque")
    throw new Error("رقم الشيك متاح فقط عند اختيار دفتر شيكات");
  const costCenterRows = input.costCenterId
    ? await tx
        .select({ id: accountingCostCenters.id })
        .from(accountingCostCenters)
        .where(
          and(
            eq(accountingCostCenters.id, input.costCenterId),
            eq(accountingCostCenters.companyId, context.company.id),
            eq(accountingCostCenters.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (input.costCenterId && !costCenterRows[0])
    throw new Error("مركز التكلفة غير فعال أو لا يتبع الشركة الحالية");
  const priceList = await tx
    .select()
    .from(accountingPriceLists)
    .where(
      and(
        eq(accountingPriceLists.companyId, context.company.id),
        eq(accountingPriceLists.currencyCode, input.currencyCode),
        eq(accountingPriceLists.isActive, true),
        ...(input.priceListId
          ? [eq(accountingPriceLists.id, input.priceListId)]
          : [])
      )
    )
    .orderBy(asc(accountingPriceLists.maxDiscountBps))
    .limit(1);
  if (input.priceListId && !priceList[0])
    throw new Error("قائمة الأسعار غير فعالة أو لا تطابق عملة المستند");
  const pricedLines = await applyPriceListItemPricesInTransaction(
    tx,
    priceList[0]?.id,
    document.type,
    input.lines
  );
  const totals = calculateDocumentTotals(pricedLines);
  const exchangeRatePpm = normalizeExchangeRatePpm(
    input.currencyCode,
    input.exchangeRatePpm
  );
  assertBaseAmountRepresentable(totals.totalMinor, exchangeRatePpm);
  await validateSettlementTargetsInTransaction(
    tx as never,
    context.company.id,
    {
      type: document.type,
      partnerId: input.partnerId ?? null,
      currencyCode: input.currencyCode,
      totalMinor: totals.totalMinor,
    },
    input.settlements ?? [],
    true
  );
  const requiresDiscountApproval = Boolean(
    priceList[0] &&
      exceedsDiscountLimit(
        totals.subtotalMinor,
        totals.discountMinor,
        priceList[0].maxDiscountBps
      )
  );
  const [beforeLines, beforeSettlements] = await Promise.all([
    tx
      .select()
      .from(accountingDocumentLines)
      .where(eq(accountingDocumentLines.documentId, document.id)),
    tx
      .select()
      .from(accountingDocumentSettlements)
      .where(
        eq(accountingDocumentSettlements.settlementDocumentId, document.id)
      ),
  ]);
  await tx
    .delete(accountingDocumentSettlements)
    .where(eq(accountingDocumentSettlements.settlementDocumentId, document.id));
  await tx
    .delete(accountingDocumentLines)
    .where(eq(accountingDocumentLines.documentId, document.id));
  await tx
    .update(accountingDocuments)
    .set({
      warehouseId: sourceWarehouse?.id ?? null,
      partnerId: input.partnerId ?? null,
      paymentAccountId: paymentAccountRows[0]?.id ?? null,
      destinationWarehouseId: destinationWarehouseRows[0]?.id ?? null,
      priceListId: priceList[0]?.id ?? null,
      costCenterId: costCenterRows[0]?.id ?? null,
      currencyCode: input.currencyCode,
      exchangeRatePpm,
      marketExchangeRate:
        input.marketExchangeRate != null
          ? String(input.marketExchangeRate)
          : input.currencyCode === "USD"
            ? "1"
            : null,
      subtotalMinor: totals.subtotalMinor,
      discountMinor: totals.discountMinor,
      taxRateBps: 0,
      outputTaxAccountId: null,
      inputTaxAccountId: null,
      taxMinor: 0,
      totalMinor: totals.totalMinor,
      dueAt: input.dueAt ?? null,
      chequeNumber,
      note: input.note ?? null,
      status: requiresDiscountApproval ? "pendingApproval" : "draft",
    })
    .where(eq(accountingDocuments.id, document.id));
  await tx.insert(accountingDocumentLines).values(
    pricedLines.map(line => {
      const gross = line.quantity * line.unitPriceMinor;
      return {
        documentId: document.id,
        variantId: line.variantId ?? null,
        sourceDocumentLineId: line.sourceDocumentLineId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        discountMinor: line.discountMinor ?? 0,
        lineTotalMinor: gross - (line.discountMinor ?? 0),
      };
    })
  );
  if (input.settlements?.length)
    await tx.insert(accountingDocumentSettlements).values(
      input.settlements.map(settlement => ({
        settlementDocumentId: document.id,
        targetDocumentId: settlement.targetDocumentId,
        amountMinor: settlement.amountMinor,
      }))
    );
  if (requiresDiscountApproval)
    await tx.insert(accountingApprovals).values({
      entityType: "document",
      entityId: document.id,
      action: "discountOverride",
      requestedBy: input.userId,
      reason: `خصم ${totals.discountMinor} يتجاوز حد قائمة الأسعار بعد تعديل المسودة`,
    });
  await tx.insert(accountingAuditEvents).values({
    entityType: "document",
    entityId: document.id,
    action: "draftUpdated",
    beforeJson: JSON.stringify({
      currencyCode: document.currencyCode,
      exchangeRatePpm: document.exchangeRatePpm,
      subtotalMinor: document.subtotalMinor,
      discountMinor: document.discountMinor,
      totalMinor: document.totalMinor,
      partnerId: document.partnerId,
      paymentAccountId: document.paymentAccountId,
      priceListId: document.priceListId,
      costCenterId: document.costCenterId,
      destinationWarehouseId: document.destinationWarehouseId,
      note: document.note,
      lines: beforeLines,
      settlements: beforeSettlements,
    }),
    afterJson: JSON.stringify({
      currencyCode: input.currencyCode,
      exchangeRatePpm: input.exchangeRatePpm,
      totals,
      partnerId: input.partnerId ?? null,
      paymentAccountId: paymentAccountRows[0]?.id ?? null,
      priceListId: priceList[0]?.id ?? null,
      costCenterId: costCenterRows[0]?.id ?? null,
      destinationWarehouseId: destinationWarehouseRows[0]?.id ?? null,
      note: input.note ?? null,
      status: requiresDiscountApproval ? "pendingApproval" : "draft",
      lineCount: input.lines.length,
      settlementCount: input.settlements?.length ?? 0,
    }),
    performedBy: input.userId,
  });
  return {
    id: document.id,
    documentNumber: document.documentNumber,
    status: requiresDiscountApproval
      ? ("pendingApproval" as const)
      : ("draft" as const),
  };
}

export async function updateAccountingDocumentDraft(
  input: DocumentDraftUpdateInput
) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    updateAccountingDocumentDraftInTransaction(tx as never, context, input)
  );
}

export async function submitDocumentForApprovalInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  documentId: number,
  userId: number
) {
  const docs = await tx
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.id, documentId),
        eq(accountingDocuments.companyId, companyId)
      )
    )
    .limit(1);
  const document = docs[0];
  if (!document || document.status !== "draft")
    throw new Error("لا يمكن إرسال هذا المستند للموافقة");
  assertDocumentSubmitter(document.createdBy, userId);
  await tx
    .update(accountingDocuments)
    .set({ status: "pendingApproval" })
    .where(eq(accountingDocuments.id, documentId));
  await tx.insert(accountingApprovals).values({
    entityType: "document",
    entityId: documentId,
    action: "post",
    requestedBy: userId,
  });
  return { status: "pendingApproval" as const };
}

export async function submitDocumentForApproval(
  documentId: number,
  userId: number
) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db.transaction(tx =>
    submitDocumentForApprovalInTransaction(
      tx as never,
      company.id,
      documentId,
      userId
    )
  );
}

function journalLinesForDocument(
  type: string,
  totalMinor: number,
  baseMinor: number,
  accounts: Record<string, number>,
  settlementAccountId?: number,
  costOfGoodsSoldUsdMinor = 0,
  isCheque = false,
  taxMinor = 0,
  taxBaseMinor = 0,
  outputTaxAccountId?: number | null,
  inputTaxAccountId?: number | null
) {
  const debit = (
    accountId: number,
    amountMinor: number,
    baseAmount: number
  ) => ({
    accountId,
    debitMinor: amountMinor,
    creditMinor: 0,
    baseDebitMinor: baseAmount,
    baseCreditMinor: 0,
  });
  const credit = (
    accountId: number,
    amountMinor: number,
    baseAmount: number
  ) => ({
    accountId,
    debitMinor: 0,
    creditMinor: amountMinor,
    baseDebitMinor: 0,
    baseCreditMinor: baseAmount,
  });
  const netMinor = totalMinor - taxMinor;
  const netBaseMinor = baseMinor - taxBaseMinor;
  if (
    taxMinor > 0 &&
    ((!outputTaxAccountId &&
      (type === "saleInvoice" || type === "salesReturn")) ||
      (!inputTaxAccountId &&
        (type === "purchaseInvoice" || type === "purchaseReturn")))
  )
    throw new Error("حساب الضريبة المحفوظ على المستند غير صالح");
  if (type === "saleInvoice")
    return [
      debit(accounts["1120"]!, totalMinor, baseMinor),
      credit(accounts["4100"]!, netMinor, netBaseMinor),
      ...(taxMinor > 0
        ? [credit(outputTaxAccountId!, taxMinor, taxBaseMinor)]
        : []),
      ...(costOfGoodsSoldUsdMinor > 0
        ? [
            {
              ...debit(
                accounts["5100"]!,
                costOfGoodsSoldUsdMinor,
                costOfGoodsSoldUsdMinor
              ),
              currencyCode: "USD",
              exchangeRatePpm: 1_000_000,
            },
            {
              ...credit(
                accounts["1130"]!,
                costOfGoodsSoldUsdMinor,
                costOfGoodsSoldUsdMinor
              ),
              currencyCode: "USD",
              exchangeRatePpm: 1_000_000,
            },
          ]
        : []),
    ];
  if (type === "purchaseInvoice")
    return [
      debit(accounts["1130"]!, netMinor, netBaseMinor),
      ...(taxMinor > 0
        ? [debit(inputTaxAccountId!, taxMinor, taxBaseMinor)]
        : []),
      credit(accounts["2110"]!, totalMinor, baseMinor),
    ];
  if (type === "receipt")
    return [
      debit(
        isCheque
          ? accounts["1140"]!
          : (settlementAccountId ?? accounts["1110"]!),
        totalMinor,
        baseMinor
      ),
      credit(accounts["1120"]!, totalMinor, baseMinor),
    ];
  if (type === "payment")
    return [
      debit(accounts["2110"]!, totalMinor, baseMinor),
      credit(
        isCheque
          ? accounts["2120"]!
          : (settlementAccountId ?? accounts["1110"]!),
        totalMinor,
        baseMinor
      ),
    ];
  if (type === "salesReturn")
    return [
      debit(accounts["4100"]!, netMinor, netBaseMinor),
      ...(taxMinor > 0
        ? [debit(outputTaxAccountId!, taxMinor, taxBaseMinor)]
        : []),
      credit(accounts["1120"]!, totalMinor, baseMinor),
      ...(costOfGoodsSoldUsdMinor > 0
        ? [
            {
              ...debit(
                accounts["1130"]!,
                costOfGoodsSoldUsdMinor,
                costOfGoodsSoldUsdMinor
              ),
              currencyCode: "USD",
              exchangeRatePpm: 1_000_000,
            },
            {
              ...credit(
                accounts["5100"]!,
                costOfGoodsSoldUsdMinor,
                costOfGoodsSoldUsdMinor
              ),
              currencyCode: "USD",
              exchangeRatePpm: 1_000_000,
            },
          ]
        : []),
    ];
  return [
    debit(accounts["2110"]!, totalMinor, baseMinor),
    credit(accounts["1130"]!, netMinor, netBaseMinor),
    ...(taxMinor > 0
      ? [credit(inputTaxAccountId!, taxMinor, taxBaseMinor)]
      : []),
  ];
}

export async function cancelAccountingDocumentInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: { documentId: number; userId: number }
) {
  const [document] = await tx
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.id, input.documentId),
        eq(accountingDocuments.companyId, companyId)
      )
    )
    .limit(1);
  if (!document || document.status !== "draft")
    throw new Error("لا يمكن إلغاء إلا مستند مسودة قبل الإرسال للموافقة");
  assertDocumentSubmitter(document.createdBy, input.userId);
  await tx
    .update(accountingDocuments)
    .set({ status: "cancelled" })
    .where(eq(accountingDocuments.id, document.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "document",
    entityId: document.id,
    action: "draftCancelled",
    afterJson: JSON.stringify({ documentNumber: document.documentNumber }),
    performedBy: input.userId,
  });
  return { status: "cancelled" as const };
}

export async function cancelAccountingDocument(input: {
  documentId: number;
  userId: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(tx =>
    cancelAccountingDocumentInTransaction(tx as never, company.id, input)
  );
}

export async function approveAndPostDocumentInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  documentId: number,
  approverId: number,
  allowSelfApproval = false
) {
  const docs = await tx
    .select()
    .from(accountingDocuments)
    .where(eq(accountingDocuments.id, documentId))
    .limit(1);
  const document = docs[0];
  if (
    !document ||
    document.companyId !== context.company.id ||
    document.status !== "pendingApproval" &&
    document.status !== "draft"
  )
    throw new Error("المستند غير جاهز للترحيل");
  if (!allowSelfApproval)
    assertApproverSeparation(document.createdBy, approverId);
  if (
    document.fiscalPeriodId !== context.period.id ||
    context.period.status !== "open"
  )
    throw new Error("الفترة المالية غير مفتوحة للترحيل");
  const effectiveExchangeRatePpm = normalizeExchangeRatePpm(
    document.currencyCode,
    document.exchangeRatePpm
  );
  assertBaseAmountRepresentable(document.totalMinor, effectiveExchangeRatePpm);
  if (document.type === "stockTransfer") {
    const transferLines = await tx
      .select()
      .from(accountingDocumentLines)
      .where(eq(accountingDocumentLines.documentId, documentId));
    const effects = buildStockTransferEffects({
      sourceWarehouseId: document.warehouseId,
      destinationWarehouseId: document.destinationWarehouseId,
      lines: transferLines,
    });
    for (const delta of effects.warehouseDeltas) {
      await changeWarehouseVariantBalance(
        tx as never,
        delta.warehouseId,
        delta.variantId,
        delta.quantityChange
      );
    }
    for (const movement of effects.movements) {
      await tx.insert(inventoryMovements).values([
        {
          variantId: movement.variantId,
          type: movement.type,
          quantity: movement.quantity,
          reason: `تحويل ${document.documentNumber} — ${movement.type === "out" ? "خروج" : "دخول"}`,
          note: document.note,
          performedBy: approverId,
        },
      ]);
    }
    await tx
      .update(accountingDocuments)
      .set({
        status: "posted",
        approvedBy: approverId,
        approvedAt: new Date(),
        postedAt: new Date(),
      })
      .where(eq(accountingDocuments.id, documentId));
    await tx
      .update(accountingApprovals)
      .set({ status: "approved", decidedBy: approverId, decidedAt: new Date() })
      .where(
        and(
          eq(accountingApprovals.entityType, "document"),
          eq(accountingApprovals.entityId, documentId),
          eq(accountingApprovals.status, "pending")
        )
      );
    await tx.insert(accountingAuditEvents).values({
      entityType: "document",
      entityId: documentId,
      action: "stockTransferred",
      afterJson: JSON.stringify({
        sourceWarehouseId: document.warehouseId,
        destinationWarehouseId: document.destinationWarehouseId,
      }),
      performedBy: approverId,
    });
    return {
      journalEntryId: null,
      documentNumber: document.documentNumber,
      status: "posted" as const,
    };
  }
  const itemLines = await tx
    .select()
    .from(accountingDocumentLines)
    .where(eq(accountingDocumentLines.documentId, documentId));
  const inbound =
    document.type === "purchaseInvoice" || document.type === "salesReturn";
  const outbound =
    document.type === "saleInvoice" || document.type === "purchaseReturn";
  let costOfGoodsSoldUsdMinor = 0;
  if (inbound || outbound) {
    if (!document.warehouseId)
      throw new Error("لا يوجد مخزن مصدر مرتبط بالمستند");
    for (const line of itemLines) {
      if (!line.variantId) continue;
      const [variant] = await tx
        .select()
        .from(inventoryVariants)
        .where(eq(inventoryVariants.id, line.variantId))
        .limit(1);
      if (!variant) throw new Error("أحد أصناف المستند غير موجود");
      let historicalReturnUnitCost: number | null = null;
      let historicalPurchaseReturnValueUsdMinor: number | null = null;
      if (document.type === "salesReturn") {
        if (!line.sourceDocumentLineId)
          throw new Error(
            "يتطلب مرتجع المبيعات اختيار سطر فاتورة البيع الأصلي"
          );
        const sourceRows = await tx
          .select({
            id: accountingDocumentLines.id,
            variantId: accountingDocumentLines.variantId,
            quantity: accountingDocumentLines.quantity,
            unitCostUsdMinor: accountingDocumentLines.unitCostUsdMinor,
            type: accountingDocuments.type,
            status: accountingDocuments.status,
          })
          .from(accountingDocumentLines)
          .innerJoin(
            accountingDocuments,
            eq(accountingDocumentLines.documentId, accountingDocuments.id)
          )
          .where(eq(accountingDocumentLines.id, line.sourceDocumentLineId))
          .limit(1);
        const sourceLine = sourceRows[0];
        if (
          !sourceLine ||
          sourceLine.type !== "saleInvoice" ||
          sourceLine.status !== "posted" ||
          sourceLine.variantId !== line.variantId ||
          sourceLine.unitCostUsdMinor === null
        )
          throw new Error("سطر فاتورة البيع الأصلي غير صالح للمرتجع");
        const returnedRows = await tx
          .select({
            quantity: sql<number>`coalesce(sum(${accountingDocumentLines.quantity}), 0)`,
          })
          .from(accountingDocumentLines)
          .innerJoin(
            accountingDocuments,
            eq(accountingDocumentLines.documentId, accountingDocuments.id)
          )
          .where(
            and(
              eq(accountingDocumentLines.sourceDocumentLineId, sourceLine.id),
              eq(accountingDocuments.type, "salesReturn"),
              eq(accountingDocuments.status, "posted")
            )
          );
        if (
          Number(returnedRows[0]?.quantity ?? 0) + line.quantity >
          sourceLine.quantity
        )
          throw new Error("كمية المرتجع تتجاوز كمية البيع الأصلية");
        historicalReturnUnitCost = sourceLine.unitCostUsdMinor;
      }
      if (document.type === "purchaseReturn") {
        if (!line.sourceDocumentLineId)
          throw new Error(
            "يتطلب مرتجع المشتريات اختيار سطر فاتورة الشراء الأصلي"
          );
        const sourceRows = await tx
          .select({
            id: accountingDocumentLines.id,
            variantId: accountingDocumentLines.variantId,
            quantity: accountingDocumentLines.quantity,
            unitPriceMinor: accountingDocumentLines.unitPriceMinor,
            discountMinor: accountingDocumentLines.discountMinor,
            type: accountingDocuments.type,
            status: accountingDocuments.status,
            companyId: accountingDocuments.companyId,
            currencyCode: accountingDocuments.currencyCode,
            exchangeRatePpm: accountingDocuments.exchangeRatePpm,
            partnerId: accountingDocuments.partnerId,
          })
          .from(accountingDocumentLines)
          .innerJoin(
            accountingDocuments,
            eq(accountingDocumentLines.documentId, accountingDocuments.id)
          )
          .where(eq(accountingDocumentLines.id, line.sourceDocumentLineId))
          .limit(1);
        const sourceLine = sourceRows[0];
        if (
          !sourceLine ||
          sourceLine.companyId !== context.company.id ||
          sourceLine.type !== "purchaseInvoice" ||
          sourceLine.status !== "posted" ||
          sourceLine.variantId !== line.variantId ||
          sourceLine.partnerId !== document.partnerId
        )
          throw new Error("سطر فاتورة الشراء الأصلي غير صالح للمرتجع");
        if (
          sourceLine.currencyCode !== document.currencyCode ||
          sourceLine.exchangeRatePpm !== document.exchangeRatePpm
        )
          throw new Error(
            "عملة وسعر صرف مرتجع الشراء يجب أن يطابقا فاتورة الشراء الأصلية"
          );
        const proportionalDiscount = Math.round(
          (sourceLine.discountMinor * line.quantity) / sourceLine.quantity
        );
        if (
          line.unitPriceMinor !== sourceLine.unitPriceMinor ||
          (line.discountMinor ?? 0) !== proportionalDiscount
        )
          throw new Error(
            "سعر وخصم مرتجع الشراء يجب أن يطابقا السطر الأصلي بنسبة الكمية المرتجعة"
          );
        const returnedRows = await tx
          .select({
            quantity: sql<number>`coalesce(sum(${accountingDocumentLines.quantity}), 0)`,
          })
          .from(accountingDocumentLines)
          .innerJoin(
            accountingDocuments,
            eq(accountingDocumentLines.documentId, accountingDocuments.id)
          )
          .where(
            and(
              eq(accountingDocumentLines.sourceDocumentLineId, sourceLine.id),
              eq(accountingDocuments.type, "purchaseReturn"),
              eq(accountingDocuments.status, "posted")
            )
          );
        if (
          Number(returnedRows[0]?.quantity ?? 0) + line.quantity >
          sourceLine.quantity
        )
          throw new Error("كمية المرتجع تتجاوز كمية الشراء الأصلية");
        historicalPurchaseReturnValueUsdMinor = calculateBaseAmount(
          line.lineTotalMinor,
          normalizeExchangeRatePpm(
            sourceLine.currencyCode,
            sourceLine.exchangeRatePpm
          )
        );
      }
      const valuation =
        document.type === "purchaseReturn"
          ? applyPurchaseReturnInventoryValuation({
              currentQuantity: variant.stockQuantity,
              currentValueUsdMinor: variant.inventoryValueUsdMinor,
              returnedQuantity: line.quantity,
              historicalReturnValueUsdMinor:
                historicalPurchaseReturnValueUsdMinor!,
            })
          : outbound
            ? applyOutboundInventoryValuation({
                currentQuantity: variant.stockQuantity,
                currentValueUsdMinor: variant.inventoryValueUsdMinor,
                averageCostUsdMinor: variant.averageCostUsdMinor,
                outgoingQuantity: line.quantity,
              })
            : applyInboundInventoryValuation({
                currentQuantity: variant.stockQuantity,
                currentValueUsdMinor: variant.inventoryValueUsdMinor,
                incomingQuantity: line.quantity,
                incomingValueUsdMinor:
                  document.type === "purchaseInvoice"
                    ? calculateBaseAmount(
                        line.lineTotalMinor,
                        effectiveExchangeRatePpm
                      )
                    : historicalReturnUnitCost! * line.quantity,
              });
      if (document.type === "saleInvoice")
        costOfGoodsSoldUsdMinor += (
          valuation as ReturnType<typeof applyOutboundInventoryValuation>
        ).costOfGoodsSoldUsdMinor;
      if (document.type === "salesReturn")
        costOfGoodsSoldUsdMinor += historicalReturnUnitCost! * line.quantity;
      await tx
        .update(inventoryVariants)
        .set({
          stockQuantity: valuation.quantity,
          averageCostUsdMinor: valuation.averageCostUsdMinor,
          inventoryValueUsdMinor: valuation.valueUsdMinor,
        })
        .where(eq(inventoryVariants.id, line.variantId));
      if (document.type === "saleInvoice")
        await tx
          .update(accountingDocumentLines)
          .set({
            unitCostUsdMinor:
              (valuation as ReturnType<typeof applyOutboundInventoryValuation>)
                .costOfGoodsSoldUsdMinor / line.quantity,
          })
          .where(eq(accountingDocumentLines.id, line.id));
      await changeWarehouseVariantBalance(
        tx as never,
        document.warehouseId,
        line.variantId,
        inbound ? line.quantity : -line.quantity
      );
      const movementTotalValueUsdMinor =
        document.type === "purchaseInvoice"
          ? calculateBaseAmount(line.lineTotalMinor, effectiveExchangeRatePpm)
          : document.type === "purchaseReturn"
            ? historicalPurchaseReturnValueUsdMinor
            : document.type === "saleInvoice"
              ? (
                  valuation as ReturnType<
                    typeof applyOutboundInventoryValuation
                  >
                ).costOfGoodsSoldUsdMinor
              : document.type === "salesReturn"
                ? historicalReturnUnitCost! * line.quantity
                : null;
      await tx.insert(inventoryMovements).values({
        variantId: line.variantId,
        type: outbound ? "out" : "in",
        quantity: line.quantity,
        reason: `ترحيل ${document.documentNumber}`,
        note: document.note,
        supplierPartnerId:
          document.type === "purchaseInvoice" ||
          document.type === "purchaseReturn"
            ? document.partnerId
            : null,
        costCenterId: document.costCenterId,
        unitCostUsdMinor:
          movementTotalValueUsdMinor === null
            ? null
            : Math.round(movementTotalValueUsdMinor / line.quantity),
        totalValueUsdMinor: movementTotalValueUsdMinor,
        performedBy: approverId,
      });
    }
  }
  const accountRows = await tx
    .select({ id: accountingAccounts.id, code: accountingAccounts.code })
    .from(accountingAccounts)
    .where(eq(accountingAccounts.companyId, context.company.id));
  const accountMap = Object.fromEntries(
    accountRows.map(account => [account.code, account.id])
  );
  const baseMinor = calculateBaseAmount(
    document.totalMinor,
    effectiveExchangeRatePpm
  );
  const taxBaseMinor = calculateBaseAmount(
    document.taxMinor,
    effectiveExchangeRatePpm
  );
  const paymentAccountRows = document.paymentAccountId
    ? await tx
        .select()
        .from(accountingPaymentAccounts)
        .where(
          and(
            eq(accountingPaymentAccounts.id, document.paymentAccountId),
            eq(accountingPaymentAccounts.companyId, context.company.id),
            eq(accountingPaymentAccounts.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (
    (document.type === "receipt" || document.type === "payment") &&
    !paymentAccountRows[0]
  )
    throw new Error("لا يوجد حساب دفع فعال مرتبط بالمستند");
  const lines = journalLinesForDocument(
    document.type,
    document.totalMinor,
    baseMinor,
    accountMap,
    paymentAccountRows[0]?.accountId,
    costOfGoodsSoldUsdMinor,
    paymentAccountRows[0]?.type === "cheque",
    document.taxMinor,
    taxBaseMinor,
    document.outputTaxAccountId,
    document.inputTaxAccountId
  );
  assertBalancedJournal(lines);
  const entryResult = await tx.insert(accountingJournalEntries).values({
    companyId: context.company.id,
    branchId: document.branchId,
    fiscalPeriodId: document.fiscalPeriodId,
    entryNumber: `J-${document.documentNumber}`,
    entryDate: new Date(),
    sourceType: "document",
    sourceId: document.id,
    status: "posted",
    memo: document.note,
    postedBy: approverId,
    postedAt: new Date(),
    createdBy: approverId,
  });
  const journalEntryId = Number(entryResult[0].insertId);
  await tx.insert(accountingJournalLines).values(
    lines.map(line => ({
      journalEntryId,
      accountId: line.accountId,
      costCenterId: document.costCenterId,
      currencyCode:
        "currencyCode" in line ? line.currencyCode : document.currencyCode,
      exchangeRatePpm:
        "exchangeRatePpm" in line
          ? line.exchangeRatePpm
          : effectiveExchangeRatePpm,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      baseDebitMinor: line.baseDebitMinor,
      baseCreditMinor: line.baseCreditMinor,
    }))
  );
  if (paymentAccountRows[0]?.type === "cheque") {
    if (
      (document.type !== "receipt" && document.type !== "payment") ||
      !document.chequeNumber
    )
      throw new Error("بيانات سند الشيك غير مكتملة");
    await tx.insert(accountingCheques).values({
      companyId: context.company.id,
      branchId: document.branchId,
      sourceDocumentId: document.id,
      paymentAccountId: paymentAccountRows[0].id,
      chequeNumber: document.chequeNumber,
      direction: document.type === "receipt" ? "received" : "issued",
      amountMinor: document.totalMinor,
      currencyCode: document.currencyCode,
      exchangeRatePpm: document.exchangeRatePpm,
      createdBy: approverId,
    });
    await tx.insert(accountingAuditEvents).values({
      entityType: "cheque",
      entityId: document.id,
      action: "issued",
      afterJson: JSON.stringify({
        chequeNumber: document.chequeNumber,
        direction: document.type === "receipt" ? "received" : "issued",
        amountMinor: document.totalMinor,
        sourceDocumentId: document.id,
      }),
      performedBy: approverId,
    });
  }
  await tx
    .update(accountingDocuments)
    .set({
      status: "posted",
      exchangeRatePpm: effectiveExchangeRatePpm,
      marketExchangeRate:
        document.marketExchangeRate ??
        (document.currencyCode === "USD" ? "1" : null),
      approvedBy: approverId,
      approvedAt: new Date(),
      postedAt: new Date(),
    })
    .where(eq(accountingDocuments.id, documentId));
  await tx
    .update(accountingApprovals)
    .set({ status: "approved", decidedBy: approverId, decidedAt: new Date() })
    .where(
      and(
        eq(accountingApprovals.entityType, "document"),
        eq(accountingApprovals.entityId, documentId),
        eq(accountingApprovals.status, "pending")
      )
    );
  await tx.insert(accountingAuditEvents).values({
    entityType: "document",
    entityId: documentId,
    action: "posted",
    afterJson: JSON.stringify({ journalEntryId }),
    performedBy: approverId,
  });
  return {
    journalEntryId,
    documentNumber: document.documentNumber,
    status: "posted" as const,
  };
}

export async function approveAndPostDocument(
  documentId: number,
  approverId: number
) {
  const db = await dbOrThrow();
  const context = await setupContext(approverId);
  const [roles, permissions] = await Promise.all([
    getAccountingRoleCodes(approverId),
    getAccountingPermissions(approverId),
  ]);
  return db.transaction(tx =>
    approveAndPostDocumentInTransaction(
      tx as never,
      context,
      documentId,
      approverId,
      canManagerApproveOwnDocument(roles, permissions)
    )
  );
}

export async function listCheques(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      id: accountingCheques.id,
      chequeNumber: accountingCheques.chequeNumber,
      direction: accountingCheques.direction,
      amountMinor: accountingCheques.amountMinor,
      currencyCode: accountingCheques.currencyCode,
      status: accountingCheques.status,
      documentNumber: accountingDocuments.documentNumber,
      documentType: accountingDocuments.type,
      paymentAccountName: accountingPaymentAccounts.name,
      createdAt: accountingCheques.createdAt,
      clearedAt: accountingCheques.clearedAt,
      bouncedAt: accountingCheques.bouncedAt,
    })
    .from(accountingCheques)
    .innerJoin(
      accountingDocuments,
      eq(accountingCheques.sourceDocumentId, accountingDocuments.id)
    )
    .innerJoin(
      accountingPaymentAccounts,
      eq(accountingCheques.paymentAccountId, accountingPaymentAccounts.id)
    )
    .where(eq(accountingCheques.companyId, company.id))
    .orderBy(desc(accountingCheques.createdAt));
}

function chequeJournalLines(input: {
  direction: "received" | "issued";
  action: "clear" | "bounce";
  amountMinor: number;
  baseMinor: number;
  accounts: Record<string, number>;
  bankAccountId?: number;
}) {
  const debit = (
    accountId: number,
    amountMinor: number,
    baseAmount: number
  ) => ({
    accountId,
    debitMinor: amountMinor,
    creditMinor: 0,
    baseDebitMinor: baseAmount,
    baseCreditMinor: 0,
  });
  const credit = (
    accountId: number,
    amountMinor: number,
    baseAmount: number
  ) => ({
    accountId,
    debitMinor: 0,
    creditMinor: amountMinor,
    baseDebitMinor: 0,
    baseCreditMinor: baseAmount,
  });
  if (input.direction === "received")
    return input.action === "clear"
      ? [
          debit(input.bankAccountId!, input.amountMinor, input.baseMinor),
          credit(input.accounts["1140"]!, input.amountMinor, input.baseMinor),
        ]
      : [
          debit(input.accounts["1120"]!, input.amountMinor, input.baseMinor),
          credit(input.accounts["1140"]!, input.amountMinor, input.baseMinor),
        ];
  return input.action === "clear"
    ? [
        debit(input.accounts["2120"]!, input.amountMinor, input.baseMinor),
        credit(input.bankAccountId!, input.amountMinor, input.baseMinor),
      ]
    : [
        debit(input.accounts["2120"]!, input.amountMinor, input.baseMinor),
        credit(input.accounts["2110"]!, input.amountMinor, input.baseMinor),
      ];
}

export async function settleChequeInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: Awaited<ReturnType<typeof setupContext>>,
  input: {
    userId: number;
    chequeId: number;
    action: "clear" | "bounce";
    bankPaymentAccountId?: number;
  }
) {
  const [cheque] = await tx
    .select()
    .from(accountingCheques)
    .where(
      and(
        eq(accountingCheques.id, input.chequeId),
        eq(accountingCheques.companyId, context.company.id)
      )
    )
    .limit(1);
  if (!cheque || cheque.status !== "pending")
    throw new Error("لا يمكن تسوية إلا شيك معلق");
  if (context.period.status !== "open")
    throw new Error("الفترة المالية الحالية غير مفتوحة لتسوية الشيك");
  const [sourceDocument] = await tx
    .select()
    .from(accountingDocuments)
    .where(
      and(
        eq(accountingDocuments.id, cheque.sourceDocumentId),
        eq(accountingDocuments.companyId, context.company.id),
        eq(accountingDocuments.status, "posted")
      )
    )
    .limit(1);
  if (!sourceDocument)
    throw new Error("مستند الشيك المصدر غير مرحّل أو لا يتبع الشركة الحالية");
  const [bankAccount] =
    input.action === "clear" && input.bankPaymentAccountId
      ? await tx
          .select()
          .from(accountingPaymentAccounts)
          .where(
            and(
              eq(accountingPaymentAccounts.id, input.bankPaymentAccountId),
              eq(accountingPaymentAccounts.companyId, context.company.id),
              eq(accountingPaymentAccounts.type, "bank"),
              eq(accountingPaymentAccounts.currencyCode, cheque.currencyCode),
              eq(accountingPaymentAccounts.isActive, true)
            )
          )
          .limit(1)
      : [];
  if (input.action === "clear" && !bankAccount)
    throw new Error(
      "اختر حساباً مصرفياً فعالاً وبنفس عملة الشيك للتحصيل أو الصرف"
    );
  const accounts = await tx
    .select({ id: accountingAccounts.id, code: accountingAccounts.code })
    .from(accountingAccounts)
    .where(eq(accountingAccounts.companyId, context.company.id));
  const accountMap = Object.fromEntries(
    accounts.map(account => [account.code, account.id])
  );
  const baseMinor = calculateBaseAmount(
    cheque.amountMinor,
    cheque.exchangeRatePpm
  );
  const lines = chequeJournalLines({
    direction: cheque.direction,
    action: input.action,
    amountMinor: cheque.amountMinor,
    baseMinor,
    accounts: accountMap,
    bankAccountId: bankAccount?.accountId,
  });
  assertBalancedJournal(lines);
  const entryResult = await tx.insert(accountingJournalEntries).values({
    companyId: context.company.id,
    branchId: cheque.branchId,
    fiscalPeriodId: context.period.id,
    entryNumber: `J-CHQ-${cheque.id}-${input.action === "clear" ? "CLR" : "BNC"}`,
    entryDate: new Date(),
    sourceType: input.action === "clear" ? "chequeClearance" : "chequeBounce",
    sourceId: cheque.id,
    status: "posted",
    memo: `${input.action === "clear" ? "تسوية" : "ارتداد"} شيك ${cheque.chequeNumber}`,
    postedBy: input.userId,
    postedAt: new Date(),
    createdBy: input.userId,
  });
  const journalEntryId = Number(entryResult[0].insertId);
  await tx.insert(accountingJournalLines).values(
    lines.map(line => ({
      journalEntryId,
      accountId: line.accountId,
      currencyCode: cheque.currencyCode,
      exchangeRatePpm: cheque.exchangeRatePpm,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      baseDebitMinor: line.baseDebitMinor,
      baseCreditMinor: line.baseCreditMinor,
      memo: `شيك ${cheque.chequeNumber}`,
    }))
  );
  const now = new Date();
  await tx
    .update(accountingCheques)
    .set(
      input.action === "clear"
        ? {
            status: "cleared",
            clearedJournalEntryId: journalEntryId,
            clearedAt: now,
          }
        : {
            status: "bounced",
            bouncedJournalEntryId: journalEntryId,
            bouncedAt: now,
          }
    )
    .where(eq(accountingCheques.id, cheque.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "cheque",
    entityId: cheque.id,
    action: input.action === "clear" ? "cleared" : "bounced",
    beforeJson: JSON.stringify({ status: cheque.status }),
    afterJson: JSON.stringify({
      status: input.action === "clear" ? "cleared" : "bounced",
      journalEntryId,
      bankPaymentAccountId: bankAccount?.id ?? null,
    }),
    performedBy: input.userId,
  });
  return {
    chequeId: cheque.id,
    status:
      input.action === "clear" ? ("cleared" as const) : ("bounced" as const),
    journalEntryId,
  };
}

export async function settleCheque(input: {
  userId: number;
  chequeId: number;
  action: "clear" | "bounce";
  bankPaymentAccountId?: number;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    settleChequeInTransaction(tx as never, context, input)
  );
}

type DailyEntryCreateInput = {
  userId: number;
  entryDate: Date;
  entryType: "expense" | "receipt" | "payment" | "transfer" | "adjustment";
  voucherNumber?: string;
  description: string;
  category?: string;
  note?: string;
  currencyCode: string;
  marketExchangeRate?: number;
  amountMinor: number;
  debitAccountId: number;
  creditAccountId: number;
  costCenterId?: number;
  customerPartnerId?: number;
  supplierPartnerId?: number;
  paymentAccountId?: number;
  attachmentUrl?: string;
  attachmentKey?: string;
};

async function resolveDailyEntryAccounts(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: Pick<
    DailyEntryCreateInput,
    | "debitAccountId"
    | "creditAccountId"
    | "currencyCode"
    | "costCenterId"
    | "customerPartnerId"
    | "supplierPartnerId"
    | "paymentAccountId"
  >
) {
  if (input.debitAccountId === input.creditAccountId)
    throw new Error("يجب اختيار حسابين مختلفين للمدين والدائن");
  const accountIds = [input.debitAccountId, input.creditAccountId];
  const accounts = await tx
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.companyId, companyId),
        inArray(accountingAccounts.id, accountIds),
        eq(accountingAccounts.isActive, true),
        eq(accountingAccounts.acceptsPosting, true)
      )
    );
  if (accounts.length !== accountIds.length)
    throw new Error(
      "الحساب المدين أو الدائن غير فعال أو لا يتبع الشركة الحالية"
    );
  const costCenter = input.costCenterId
    ? await tx
        .select({ id: accountingCostCenters.id })
        .from(accountingCostCenters)
        .where(
          and(
            eq(accountingCostCenters.id, input.costCenterId),
            eq(accountingCostCenters.companyId, companyId),
            eq(accountingCostCenters.isActive, true)
          )
        )
        .limit(1)
    : [];
  if (input.costCenterId && !costCenter[0])
    throw new Error("مركز التكلفة غير فعال أو لا يتبع الشركة الحالية");
  if (input.paymentAccountId) {
    const [paymentAccount] = await tx
      .select({
        id: accountingPaymentAccounts.id,
        currencyCode: accountingPaymentAccounts.currencyCode,
        isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
      })
      .from(accountingPaymentAccounts)
      .where(
        and(
          eq(accountingPaymentAccounts.id, input.paymentAccountId),
          eq(accountingPaymentAccounts.companyId, companyId),
          eq(accountingPaymentAccounts.isActive, true)
        )
      )
      .limit(1);
    if (!paymentAccount)
      throw new Error("الصندوق أو المصرف غير فعال أو غير موجود");
    if (
      !paymentAccount.isMultiCurrency &&
      paymentAccount.currencyCode !== input.currencyCode
    )
      throw new Error("عملة الصندوق أو المصرف يجب أن تطابق عملة الإدخال");
  }
  const partnerIds = [input.customerPartnerId, input.supplierPartnerId].filter(
    (id): id is number => Boolean(id)
  );
  if (partnerIds.length) {
    const partners = await tx
      .select({ id: businessPartners.id, type: businessPartners.type })
      .from(businessPartners)
      .where(inArray(businessPartners.id, partnerIds));
    if (partners.length !== partnerIds.length)
      throw new Error("العميل أو المورد المختار غير موجود");
    const customer = input.customerPartnerId
      ? partners.find(partner => partner.id === input.customerPartnerId)
      : undefined;
    const supplier = input.supplierPartnerId
      ? partners.find(partner => partner.id === input.supplierPartnerId)
      : undefined;
    if (customer && customer.type !== "customer" && customer.type !== "both")
      throw new Error("الشريك المختار للعميل ليس عميلاً صالحاً");
    if (supplier && supplier.type !== "supplier" && supplier.type !== "both")
      throw new Error("الشريك المختار للمورد ليس مورداً صالحاً");
  }
  return { costCenterId: costCenter[0]?.id ?? null };
}

export async function listDailyEntries(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const entries = await db
    .select({
      id: accountingDailyEntries.id,
      entryNumber: accountingDailyEntries.entryNumber,
      entryDate: accountingDailyEntries.entryDate,
      entryType: accountingDailyEntries.entryType,
      voucherNumber: accountingDailyEntries.voucherNumber,
      description: accountingDailyEntries.description,
      category: accountingDailyEntries.category,
      note: accountingDailyEntries.note,
      currencyCode: accountingDailyEntries.currencyCode,
      marketExchangeRate: accountingDailyEntries.marketExchangeRate,
      amountMinor: accountingDailyEntries.amountMinor,
      baseAmountMinor: accountingDailyEntries.baseAmountMinor,
      debitAccountId: accountingDailyEntries.debitAccountId,
      creditAccountId: accountingDailyEntries.creditAccountId,
      costCenterId: accountingDailyEntries.costCenterId,
      costCenterName: accountingCostCenters.name,
      customerPartnerId: accountingDailyEntries.customerPartnerId,
      supplierPartnerId: accountingDailyEntries.supplierPartnerId,
      attachmentUrl: accountingDailyEntries.attachmentUrl,
      attachmentKey: accountingDailyEntries.attachmentKey,
      status: accountingDailyEntries.status,
      journalEntryId: accountingDailyEntries.journalEntryId,
      createdAt: accountingDailyEntries.createdAt,
      createdBy: accountingDailyEntries.createdBy,
    })
    .from(accountingDailyEntries)
    .leftJoin(
      accountingCostCenters,
      eq(accountingDailyEntries.costCenterId, accountingCostCenters.id)
    )
    .where(eq(accountingDailyEntries.companyId, company.id))
    .orderBy(
      desc(accountingDailyEntries.entryDate),
      desc(accountingDailyEntries.id)
    )
    .limit(250);
  const accountIds = Array.from(
    new Set(
      entries.flatMap(entry => [entry.debitAccountId, entry.creditAccountId])
    )
  );
  const accounts = accountIds.length
    ? await db
        .select({
          id: accountingAccounts.id,
          code: accountingAccounts.code,
          name: accountingAccounts.name,
        })
        .from(accountingAccounts)
        .where(
          and(
            eq(accountingAccounts.companyId, company.id),
            inArray(accountingAccounts.id, accountIds)
          )
        )
    : [];
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const partnerIds = Array.from(
    new Set(
      entries.flatMap(entry =>
        [entry.customerPartnerId, entry.supplierPartnerId].filter(
          (id): id is number => Boolean(id)
        )
      )
    )
  );
  const partners = partnerIds.length
    ? await db
        .select({ id: businessPartners.id, name: businessPartners.name })
        .from(businessPartners)
        .where(inArray(businessPartners.id, partnerIds))
    : [];
  const partnersById = new Map(partners.map(partner => [partner.id, partner]));
  const creatorIds = Array.from(new Set(entries.map(entry => entry.createdBy)));
  const creators = creatorIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];
  const creatorsById = new Map(creators.map(creator => [creator.id, creator]));
  return entries.map(entry => ({
    ...entry,
    debitAccountCode: accountsById.get(entry.debitAccountId)?.code ?? "",
    debitAccountName: accountsById.get(entry.debitAccountId)?.name ?? "",
    creditAccountCode: accountsById.get(entry.creditAccountId)?.code ?? "",
    creditAccountName: accountsById.get(entry.creditAccountId)?.name ?? "",
    voucherNumber: entry.voucherNumber,
    customerPartnerName: entry.customerPartnerId
      ? (partnersById.get(entry.customerPartnerId)?.name ?? "")
      : "",
    supplierPartnerName: entry.supplierPartnerId
      ? (partnersById.get(entry.supplierPartnerId)?.name ?? "")
      : "",
    createdByName: creatorsById.get(entry.createdBy)?.name ?? "",
  }));
}

export async function createDailyEntry(input: DailyEntryCreateInput) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  const description = input.description.trim();
  if (!description) throw new Error("وصف العملية مطلوب");
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
    throw new Error("قيمة الإدخال يجب أن تكون رقماً صحيحاً موجباً");
  if (
    input.entryDate < context.period.startsOn ||
    input.entryDate > context.period.endsOn
  )
    throw new Error("تاريخ الإدخال يجب أن يقع ضمن الفترة المالية المفتوحة");
  const normalized = normalizeMarketExchangeRate(
    input.currencyCode,
    input.marketExchangeRate
  );
  const baseAmountMinor = calculateBaseAmount(
    input.amountMinor,
    normalized.exchangeRatePpm
  );
  assertBaseAmountRepresentable(input.amountMinor, normalized.exchangeRatePpm);
  return db.transaction(async tx => {
    const { costCenterId } = await resolveDailyEntryAccounts(
      tx as never,
      context.company.id,
      input
    );
    const entryNumber = `DLY-${context.branch.id}-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const inserted = await tx.insert(accountingDailyEntries).values({
      companyId: context.company.id,
      branchId: context.branch.id,
      fiscalPeriodId: context.period.id,
      entryNumber,
      entryDate: input.entryDate,
      entryType: input.entryType,
      voucherNumber: input.voucherNumber?.trim() || null,
      description,
      category: input.category?.trim() || null,
      note: input.note?.trim() || null,
      currencyCode: input.currencyCode,
      exchangeRatePpm: normalized.exchangeRatePpm,
      marketExchangeRate: String(normalized.marketExchangeRate),
      amountMinor: input.amountMinor,
      baseAmountMinor,
      debitAccountId: input.debitAccountId,
      creditAccountId: input.creditAccountId,
      paymentAccountId: input.paymentAccountId ?? null,
      costCenterId,
      customerPartnerId: input.customerPartnerId ?? null,
      supplierPartnerId: input.supplierPartnerId ?? null,
      attachmentUrl: input.attachmentUrl?.trim() || null,
      attachmentKey: input.attachmentKey?.trim() || null,
      status: "draft",
      createdBy: input.userId,
    });
    const id = Number(inserted[0].insertId);
    await tx.insert(accountingAuditEvents).values({
      entityType: "dailyEntry",
      entityId: id,
      action: "created",
      afterJson: JSON.stringify({
        entryNumber,
        entryType: input.entryType,
        amountMinor: input.amountMinor,
        currencyCode: input.currencyCode,
      }),
      performedBy: input.userId,
    });
    return { id, entryNumber, status: "draft" as const };
  });
}

type DailyCashSummaryInput = {
  userId: number;
  date?: string;
  paymentAccountId?: number;
  currencyCode?: string;
};

function nextUtcDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("تاريخ الصندوق غير صالح");
  date.setUTCDate(date.getUTCDate() + 1);
  return exchangeRateDate(date);
}

async function assertDailyCashOpeningAccess(userId: number) {
  const [roles, permissions] = await Promise.all([
    getAccountingRoleCodes(userId),
    getAccountingPermissions(userId),
  ]);
  const allowedRoles = ["system_admin", "finance_manager", "accountant"];
  if (
    !roles.some(role => allowedRoles.includes(role)) &&
    !permissions.includes("*") &&
    !permissions.includes("accounting.cash.opening")
  )
    throw new Error("لا تملك صلاحية اعتماد أو ترحيل رصيد الصندوق");
}

export async function getDailyCashSummary(input: DailyCashSummaryInput) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  const dateKey = input.date ?? exchangeRateDate();
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${nextUtcDateKey(dateKey)}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("تاريخ الصندوق غير صالح");
  const currencyCode = (input.currencyCode ?? "IQD").toUpperCase();
  const accounts = await db
    .select({
      id: accountingPaymentAccounts.id,
      accountId: accountingPaymentAccounts.accountId,
      name: accountingPaymentAccounts.name,
      type: accountingPaymentAccounts.type,
      currencyCode: accountingPaymentAccounts.currencyCode,
      isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
    })
    .from(accountingPaymentAccounts)
    .where(
      and(
        eq(accountingPaymentAccounts.companyId, context.company.id),
        eq(accountingPaymentAccounts.isActive, true),
        input.paymentAccountId
          ? eq(accountingPaymentAccounts.id, input.paymentAccountId)
          : sql`(${accountingPaymentAccounts.currencyCode} = ${currencyCode} OR ${accountingPaymentAccounts.isMultiCurrency} = true)`
      )
    )
    .orderBy(asc(accountingPaymentAccounts.name));
  if (input.paymentAccountId && !accounts[0])
    throw new Error("الصندوق أو المصرف غير موجود");
  const accountIds = accounts.map(account => account.id);
  const openingRows = accountIds.length
    ? await db
        .select({
          paymentAccountId: accountingDailyCashOpenings.paymentAccountId,
          currencyCode: accountingDailyCashOpenings.currencyCode,
          amountMinor: accountingDailyCashOpenings.amountMinor,
          baseAmountMinor: accountingDailyCashOpenings.baseAmountMinor,
          note: accountingDailyCashOpenings.note,
          status: accountingDailyCashOpenings.status,
        })
        .from(accountingDailyCashOpenings)
        .where(
          and(
            eq(accountingDailyCashOpenings.companyId, context.company.id),
            eq(accountingDailyCashOpenings.openingDate, dateKey),
            eq(accountingDailyCashOpenings.status, "approved"),
            inArray(accountingDailyCashOpenings.paymentAccountId, accountIds)
          )
        )
    : [];
  const entries = accountIds.length
    ? await db
        .select({
          id: accountingDailyEntries.id,
          entryNumber: accountingDailyEntries.entryNumber,
          entryDate: accountingDailyEntries.entryDate,
          createdAt: accountingDailyEntries.createdAt,
          entryType: accountingDailyEntries.entryType,
          voucherNumber: accountingDailyEntries.voucherNumber,
          description: accountingDailyEntries.description,
          category: accountingDailyEntries.category,
          note: accountingDailyEntries.note,
          currencyCode: accountingDailyEntries.currencyCode,
          amountMinor: accountingDailyEntries.amountMinor,
          baseAmountMinor: accountingDailyEntries.baseAmountMinor,
          marketExchangeRate: accountingDailyEntries.marketExchangeRate,
          status: accountingDailyEntries.status,
          paymentAccountId: accountingDailyEntries.paymentAccountId,
          debitAccountName: sql<string>`(
            select name from accounting_accounts
            where id = ${accountingDailyEntries.debitAccountId}
          )`,
          creditAccountName: sql<string>`(
            select name from accounting_accounts
            where id = ${accountingDailyEntries.creditAccountId}
          )`,
          createdByName: users.name,
          paymentAccountName: accountingPaymentAccounts.name,
        })
        .from(accountingDailyEntries)
        .innerJoin(users, eq(accountingDailyEntries.createdBy, users.id))
        .leftJoin(
          accountingPaymentAccounts,
          eq(
            accountingDailyEntries.paymentAccountId,
            accountingPaymentAccounts.id
          )
        )
        .where(
          and(
            eq(accountingDailyEntries.companyId, context.company.id),
            gte(accountingDailyEntries.entryDate, start),
            lte(accountingDailyEntries.entryDate, new Date(end.getTime() - 1)),
            inArray(accountingDailyEntries.paymentAccountId, accountIds),
            sql`${accountingDailyEntries.status} <> 'cancelled'`
          )
        )
        .orderBy(
          asc(accountingDailyEntries.entryDate),
          asc(accountingDailyEntries.id)
        )
    : [];
  const summaries = accounts.map(account => {
    const opening = openingRows.find(
      row =>
        row.paymentAccountId === account.id && row.currencyCode === currencyCode
    );
    const accountEntries = entries.filter(
      row =>
        row.paymentAccountId === account.id && row.currencyCode === currencyCode
    );
    const receiptMinor = accountEntries
      .filter(row => row.status === "posted" && row.entryType === "receipt")
      .reduce((sum, row) => sum + Number(row.amountMinor), 0);
    const spentMinor = accountEntries
      .filter(row => row.status === "posted" && row.entryType !== "receipt")
      .reduce((sum, row) => sum + Number(row.amountMinor), 0);
    return {
      paymentAccountId: account.id,
      accountId: account.accountId,
      accountName: account.name,
      type: account.type,
      currencyCode: account.isMultiCurrency
        ? currencyCode
        : account.currencyCode,
      isMultiCurrency: account.isMultiCurrency,
      openingMinor: Number(opening?.amountMinor ?? 0),
      receiptMinor,
      spentMinor,
      closingMinor:
        Number(opening?.amountMinor ?? 0) + receiptMinor - spentMinor,
      entries: accountEntries,
    };
  });
  return {
    date: dateKey,
    currencyCode,
    accounts: summaries,
    totals: summaries.reduce(
      (total, summary) => ({
        openingMinor: total.openingMinor + summary.openingMinor,
        receiptMinor: total.receiptMinor + summary.receiptMinor,
        spentMinor: total.spentMinor + summary.spentMinor,
        closingMinor: total.closingMinor + summary.closingMinor,
      }),
      { openingMinor: 0, receiptMinor: 0, spentMinor: 0, closingMinor: 0 }
    ),
  };
}

type CashPeriodReportInput = {
  userId: number;
  fromDate: string;
  toDate: string;
  paymentAccountId?: number;
  currencyCode?: string;
};

export async function getCashPeriodReport(input: CashPeriodReportInput) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)
  )
    throw new Error("نطاق تاريخ تقرير النقدية غير صالح");
  if (input.fromDate > input.toDate)
    throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية");
  const currencyCode = (input.currencyCode ?? "IQD").toUpperCase();
  const start = new Date(`${input.fromDate}T00:00:00.000Z`);
  const end = new Date(`${nextUtcDateKey(input.toDate)}T00:00:00.000Z`);
  const accounts = await db
    .select({
      id: accountingPaymentAccounts.id,
      accountId: accountingPaymentAccounts.accountId,
      name: accountingPaymentAccounts.name,
      type: accountingPaymentAccounts.type,
      currencyCode: accountingPaymentAccounts.currencyCode,
      isMultiCurrency: accountingPaymentAccounts.isMultiCurrency,
    })
    .from(accountingPaymentAccounts)
    .where(
      and(
        eq(accountingPaymentAccounts.companyId, company.id),
        eq(accountingPaymentAccounts.isActive, true),
        input.paymentAccountId
          ? eq(accountingPaymentAccounts.id, input.paymentAccountId)
          : sql`(${accountingPaymentAccounts.currencyCode} = ${currencyCode} OR ${accountingPaymentAccounts.isMultiCurrency} = true)`
      )
    );
  if (input.paymentAccountId && !accounts[0])
    throw new Error("الصندوق أو المصرف غير موجود");
  const accountIds = accounts.map(account => account.id);
  const openingRows = accountIds.length
    ? await db
        .select({
          paymentAccountId: accountingDailyCashOpenings.paymentAccountId,
          currencyCode: accountingDailyCashOpenings.currencyCode,
          amountMinor: accountingDailyCashOpenings.amountMinor,
          baseAmountMinor: accountingDailyCashOpenings.baseAmountMinor,
          openingDate: accountingDailyCashOpenings.openingDate,
        })
        .from(accountingDailyCashOpenings)
        .where(
          and(
            eq(accountingDailyCashOpenings.companyId, company.id),
            lte(accountingDailyCashOpenings.openingDate, input.fromDate),
            eq(accountingDailyCashOpenings.status, "approved"),
            inArray(accountingDailyCashOpenings.paymentAccountId, accountIds),
            eq(accountingDailyCashOpenings.currencyCode, currencyCode)
          )
        )
        .orderBy(
          desc(accountingDailyCashOpenings.openingDate),
          desc(accountingDailyCashOpenings.id)
        )
    : [];
  const latestOpeningByAccount = new Map<
    number,
    (typeof openingRows)[number]
  >();
  for (const opening of openingRows)
    if (!latestOpeningByAccount.has(opening.paymentAccountId))
      latestOpeningByAccount.set(opening.paymentAccountId, opening);
  const entries = accountIds.length
    ? await db
        .select({
          id: accountingDailyEntries.id,
          entryDate: accountingDailyEntries.entryDate,
          createdAt: accountingDailyEntries.createdAt,
          entryType: accountingDailyEntries.entryType,
          voucherNumber: accountingDailyEntries.voucherNumber,
          description: accountingDailyEntries.description,
          category: accountingDailyEntries.category,
          currencyCode: accountingDailyEntries.currencyCode,
          amountMinor: accountingDailyEntries.amountMinor,
          baseAmountMinor: accountingDailyEntries.baseAmountMinor,
          marketExchangeRate: accountingDailyEntries.marketExchangeRate,
          paymentAccountId: accountingDailyEntries.paymentAccountId,
          paymentAccountName: accountingPaymentAccounts.name,
          debitAccountName: sql<string>`(
            select name from accounting_accounts
            where id = ${accountingDailyEntries.debitAccountId}
          )`,
          creditAccountName: sql<string>`(
            select name from accounting_accounts
            where id = ${accountingDailyEntries.creditAccountId}
          )`,
        })
        .from(accountingDailyEntries)
        .leftJoin(
          accountingPaymentAccounts,
          eq(
            accountingDailyEntries.paymentAccountId,
            accountingPaymentAccounts.id
          )
        )
        .where(
          and(
            eq(accountingDailyEntries.companyId, company.id),
            gte(accountingDailyEntries.entryDate, start),
            lte(accountingDailyEntries.entryDate, new Date(end.getTime() - 1)),
            eq(accountingDailyEntries.currencyCode, currencyCode),
            inArray(accountingDailyEntries.paymentAccountId, accountIds),
            eq(accountingDailyEntries.status, "posted")
          )
        )
        .orderBy(
          asc(accountingDailyEntries.entryDate),
          asc(accountingDailyEntries.id)
        )
    : [];
  const openingMinor = accounts.reduce(
    (sum, account) =>
      sum + Number(latestOpeningByAccount.get(account.id)?.amountMinor ?? 0),
    0
  );
  const openingBaseMinor = accounts.reduce(
    (sum, account) =>
      sum +
      Number(latestOpeningByAccount.get(account.id)?.baseAmountMinor ?? 0),
    0
  );
  const receipts = entries
    .filter(entry => entry.entryType === "receipt")
    .reduce((sum, entry) => sum + Number(entry.amountMinor), 0);
  const spent = entries
    .filter(entry => entry.entryType !== "receipt")
    .reduce((sum, entry) => sum + Number(entry.amountMinor), 0);
  const daily = new Map<
    string,
    { date: string; receipts: number; spent: number; closing: number }
  >();
  let running = openingMinor;
  for (const entry of entries) {
    const date = new Date(entry.entryDate).toISOString().slice(0, 10);
    const current = daily.get(date) ?? {
      date,
      receipts: 0,
      spent: 0,
      closing: running,
    };
    if (entry.entryType === "receipt") {
      current.receipts += Number(entry.amountMinor);
      running += Number(entry.amountMinor);
    } else {
      current.spent += Number(entry.amountMinor);
      running -= Number(entry.amountMinor);
    }
    current.closing = running;
    daily.set(date, current);
  }
  return {
    fromDate: input.fromDate,
    toDate: input.toDate,
    currencyCode,
    accounts: accounts.map(account => ({
      paymentAccountId: account.id,
      accountName: account.name,
      type: account.type,
      currencyCode: account.isMultiCurrency
        ? currencyCode
        : account.currencyCode,
      isMultiCurrency: account.isMultiCurrency,
    })),
    totals: {
      openingMinor,
      openingBaseMinor,
      receiptMinor: receipts,
      spentMinor: spent,
      closingMinor: openingMinor + receipts - spent,
      closingBaseMinor: entries.reduce(
        (sum, entry) =>
          sum +
          Number(entry.baseAmountMinor) *
            (entry.entryType === "receipt" ? 1 : -1),
        openingBaseMinor
      ),
    },
    daily: Array.from(daily.values()),
    entries,
  };
}

type DailyCashReconciliationInput = {
  userId: number;
  date: string;
  paymentAccountId: number;
  currencyCode: string;
  actualClosingMinor: number;
  note?: string;
};

export async function saveDailyCashReconciliation(
  input: DailyCashReconciliationInput
) {
  await assertDailyCashOpeningAccess(input.userId);
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
    throw new Error("تاريخ المطابقة غير صالح");
  if (
    !Number.isInteger(input.actualClosingMinor) ||
    input.actualClosingMinor < 0
  )
    throw new Error("الرصيد الفعلي يجب أن يكون صفراً أو رقماً صحيحاً موجباً");
  const summary = await getDailyCashSummary({
    userId: input.userId,
    date: input.date,
    paymentAccountId: input.paymentAccountId,
    currencyCode: input.currencyCode,
  });
  const account = summary.accounts.find(
    item => item.paymentAccountId === input.paymentAccountId
  );
  if (!account || account.currencyCode !== input.currencyCode)
    throw new Error("الصندوق أو العملة غير متطابقين");
  const differenceMinor = input.actualClosingMinor - account.closingMinor;
  const [existing] = await db
    .select({ id: accountingDailyCashReconciliations.id })
    .from(accountingDailyCashReconciliations)
    .where(
      and(
        eq(accountingDailyCashReconciliations.companyId, context.company.id),
        eq(accountingDailyCashReconciliations.reconciliationDate, input.date),
        eq(
          accountingDailyCashReconciliations.paymentAccountId,
          input.paymentAccountId
        ),
        eq(accountingDailyCashReconciliations.currencyCode, input.currencyCode)
      )
    )
    .limit(1);
  const values = {
    companyId: context.company.id,
    branchId: context.branch.id,
    fiscalPeriodId: context.period.id,
    reconciliationDate: input.date,
    paymentAccountId: input.paymentAccountId,
    currencyCode: input.currencyCode,
    recordedClosingMinor: account.closingMinor,
    actualClosingMinor: input.actualClosingMinor,
    differenceMinor,
    note: input.note?.trim() || null,
    createdBy: input.userId,
    updatedAt: new Date(),
  };
  let reconciliationId = existing?.id;
  if (existing) {
    await db
      .update(accountingDailyCashReconciliations)
      .set(values)
      .where(eq(accountingDailyCashReconciliations.id, existing.id));
  } else {
    const inserted = await db
      .insert(accountingDailyCashReconciliations)
      .values(values);
    reconciliationId = Number(inserted[0].insertId);
  }
  await db.insert(accountingAuditEvents).values({
    entityType: "dailyCashReconciliation",
    entityId: reconciliationId ?? 0,
    action: existing ? "updated" : "created",
    afterJson: JSON.stringify({
      date: input.date,
      paymentAccountId: input.paymentAccountId,
      recordedClosingMinor: account.closingMinor,
      actualClosingMinor: input.actualClosingMinor,
      differenceMinor,
    }),
    performedBy: input.userId,
  });
  return {
    date: input.date,
    paymentAccountId: input.paymentAccountId,
    currencyCode: input.currencyCode,
    recordedClosingMinor: account.closingMinor,
    actualClosingMinor: input.actualClosingMinor,
    differenceMinor,
  };
}

export async function listDailyCashReconciliations(input: {
  userId: number;
  fromDate?: string;
  toDate?: string;
  paymentAccountId?: number;
  limit?: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const conditions = [
    eq(accountingDailyCashReconciliations.companyId, company.id),
    input.fromDate
      ? gte(
          accountingDailyCashReconciliations.reconciliationDate,
          input.fromDate
        )
      : undefined,
    input.toDate
      ? lte(accountingDailyCashReconciliations.reconciliationDate, input.toDate)
      : undefined,
    input.paymentAccountId
      ? eq(
          accountingDailyCashReconciliations.paymentAccountId,
          input.paymentAccountId
        )
      : undefined,
  ].filter(Boolean) as Array<ReturnType<typeof eq>>;
  return db
    .select({
      id: accountingDailyCashReconciliations.id,
      reconciliationDate: accountingDailyCashReconciliations.reconciliationDate,
      paymentAccountId: accountingDailyCashReconciliations.paymentAccountId,
      paymentAccountName: accountingPaymentAccounts.name,
      currencyCode: accountingDailyCashReconciliations.currencyCode,
      recordedClosingMinor:
        accountingDailyCashReconciliations.recordedClosingMinor,
      actualClosingMinor: accountingDailyCashReconciliations.actualClosingMinor,
      differenceMinor: accountingDailyCashReconciliations.differenceMinor,
      note: accountingDailyCashReconciliations.note,
      createdByName: users.name,
      updatedAt: accountingDailyCashReconciliations.updatedAt,
    })
    .from(accountingDailyCashReconciliations)
    .innerJoin(
      accountingPaymentAccounts,
      eq(
        accountingDailyCashReconciliations.paymentAccountId,
        accountingPaymentAccounts.id
      )
    )
    .innerJoin(
      users,
      eq(accountingDailyCashReconciliations.createdBy, users.id)
    )
    .where(and(...conditions))
    .orderBy(desc(accountingDailyCashReconciliations.reconciliationDate))
    .limit(Math.min(Math.max(input.limit ?? 90, 1), 365));
}

export async function carryForwardDailyCash(input: {
  userId: number;
  date: string;
  paymentAccountId: number;
  currencyCode: string;
  note?: string;
}) {
  await assertDailyCashOpeningAccess(input.userId);
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  const summary = await getDailyCashSummary(input);
  const account = summary.accounts.find(
    item => item.paymentAccountId === input.paymentAccountId
  );
  if (!account) throw new Error("الصندوق أو المصرف غير موجود");
  const nextDate = nextUtcDateKey(input.date);
  const rate = await getOrCreateDailyExchangeRate({
    userId: input.userId,
    currencyCode: input.currencyCode,
    rateDate: new Date(`${nextDate}T12:00:00.000Z`),
  });
  const baseAmountMinor = calculateBaseAmount(
    account.closingMinor,
    rate.exchangeRatePpm
  );
  const [existing] = await db
    .select({ id: accountingDailyCashOpenings.id })
    .from(accountingDailyCashOpenings)
    .where(
      and(
        eq(accountingDailyCashOpenings.companyId, context.company.id),
        eq(accountingDailyCashOpenings.openingDate, nextDate),
        eq(
          accountingDailyCashOpenings.paymentAccountId,
          input.paymentAccountId
        ),
        eq(accountingDailyCashOpenings.currencyCode, input.currencyCode)
      )
    )
    .limit(1);
  if (existing) {
    await db
      .update(accountingDailyCashOpenings)
      .set({
        amountMinor: account.closingMinor,
        baseAmountMinor,
        exchangeRatePpm: rate.exchangeRatePpm,
        marketExchangeRate: String(rate.marketExchangeRate),
        note: input.note?.trim() || `ترحيل رصيد ${input.date}`,
        status: "approved",
        approvedBy: input.userId,
        approvedAt: new Date(),
      })
      .where(eq(accountingDailyCashOpenings.id, existing.id));
  } else {
    await db.insert(accountingDailyCashOpenings).values({
      companyId: context.company.id,
      branchId: context.branch.id,
      fiscalPeriodId: context.period.id,
      openingDate: nextDate,
      paymentAccountId: input.paymentAccountId,
      currencyCode: input.currencyCode,
      exchangeRatePpm: rate.exchangeRatePpm,
      marketExchangeRate: String(rate.marketExchangeRate),
      amountMinor: account.closingMinor,
      baseAmountMinor,
      note: input.note?.trim() || `ترحيل رصيد ${input.date}`,
      status: "approved",
      createdBy: input.userId,
      approvedBy: input.userId,
      approvedAt: new Date(),
    });
  }
  await db.insert(accountingAuditEvents).values({
    entityType: "dailyCashOpening",
    entityId: input.paymentAccountId,
    action: "carriedForward",
    afterJson: JSON.stringify({
      from: input.date,
      to: nextDate,
      amount: account.closingMinor,
    }),
    performedBy: input.userId,
  });
  return {
    nextDate,
    paymentAccountId: input.paymentAccountId,
    closingMinor: account.closingMinor,
    currencyCode: input.currencyCode,
  };
}

export async function importDailyEntries(input: {
  userId: number;
  autoPost?: boolean;
  rows: Array<
    Omit<DailyEntryCreateInput, "userId" | "entryDate"> & {
      entryDate: Date;
      sourceSheet?: string;
    }
  >;
}) {
  if (!input.rows.length)
    throw new Error("لم يتم العثور على صفوف صالحة للاستيراد");
  if (input.rows.length > 2_000)
    throw new Error("حد الاستيراد في العملية الواحدة هو 2,000 صف");
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  const defaultIqdRate = await getOrCreateDailyExchangeRate({
    userId: input.userId,
    currencyCode: "IQD",
  });
  const result = await db.transaction(async tx => {
    let imported = 0;
    const importedIds: number[] = [];
    for (const row of input.rows) {
      const description = row.description.trim();
      if (
        !description ||
        !Number.isInteger(row.amountMinor) ||
        row.amountMinor <= 0
      )
        continue;
      if (
        row.entryDate < context.period.startsOn ||
        row.entryDate > context.period.endsOn
      )
        continue;
      const [duplicate] = await tx
        .select({ id: accountingDailyEntries.id })
        .from(accountingDailyEntries)
        .where(
          and(
            eq(accountingDailyEntries.companyId, context.company.id),
            eq(accountingDailyEntries.entryDate, row.entryDate),
            eq(accountingDailyEntries.entryType, row.entryType),
            row.voucherNumber?.trim()
              ? eq(
                  accountingDailyEntries.voucherNumber,
                  row.voucherNumber.trim()
                )
              : isNull(accountingDailyEntries.voucherNumber),
            eq(accountingDailyEntries.description, description),
            eq(accountingDailyEntries.currencyCode, row.currencyCode),
            eq(accountingDailyEntries.amountMinor, row.amountMinor),
            eq(accountingDailyEntries.debitAccountId, row.debitAccountId),
            eq(accountingDailyEntries.creditAccountId, row.creditAccountId)
          )
        )
        .limit(1);
      if (duplicate) continue;
      const normalized = normalizeMarketExchangeRate(
        row.currencyCode,
        row.marketExchangeRate ??
          (row.currencyCode === "IQD" ? defaultIqdRate.marketExchangeRate : 1)
      );
      const baseAmountMinor = calculateBaseAmount(
        row.amountMinor,
        normalized.exchangeRatePpm
      );
      assertBaseAmountRepresentable(
        row.amountMinor,
        normalized.exchangeRatePpm
      );
      const { costCenterId } = await resolveDailyEntryAccounts(
        tx as never,
        context.company.id,
        row
      );
      const entryNumber = `DLY-${context.branch.id}-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const inserted = await tx.insert(accountingDailyEntries).values({
        companyId: context.company.id,
        branchId: context.branch.id,
        fiscalPeriodId: context.period.id,
        entryNumber,
        entryDate: row.entryDate,
        entryType: row.entryType,
        voucherNumber: row.voucherNumber?.trim() || null,
        description,
        category: row.category?.trim() || null,
        note:
          [
            row.note?.trim(),
            row.sourceSheet ? `TOTAL9 / ${row.sourceSheet}` : "",
          ]
            .filter(Boolean)
            .join(" · ") || null,
        currencyCode: row.currencyCode,
        exchangeRatePpm: normalized.exchangeRatePpm,
        marketExchangeRate: String(normalized.marketExchangeRate),
        amountMinor: row.amountMinor,
        baseAmountMinor,
        debitAccountId: row.debitAccountId,
        creditAccountId: row.creditAccountId,
        paymentAccountId: row.paymentAccountId ?? null,
        costCenterId,
        customerPartnerId: row.customerPartnerId ?? null,
        supplierPartnerId: row.supplierPartnerId ?? null,
        attachmentUrl: row.attachmentUrl?.trim() || null,
        attachmentKey: row.attachmentKey?.trim() || null,
        status: "draft",
        createdBy: input.userId,
      });
      await tx.insert(accountingAuditEvents).values({
        entityType: "dailyEntry",
        entityId: Number(inserted[0].insertId),
        action: "importedFromTotal9",
        afterJson: JSON.stringify({
          entryNumber,
          sourceSheet: row.sourceSheet ?? null,
        }),
        performedBy: input.userId,
      });
      imported += 1;
      importedIds.push(Number(inserted[0].insertId));
    }
    if (!imported)
      throw new Error("لم يوجد صف يقع ضمن الفترة المالية المفتوحة");
    return { imported, skipped: input.rows.length - imported, importedIds };
  });
  let posted = 0;
  let postFailed = 0;
  if (input.autoPost) {
    for (const dailyEntryId of result.importedIds) {
      try {
        await postDailyEntry({ userId: input.userId, dailyEntryId });
        posted += 1;
      } catch {
        postFailed += 1;
      }
    }
  }
  return {
    imported: result.imported,
    skipped: result.skipped,
    posted,
    postFailed,
  };
}

export async function submitDailyEntryForApproval(input: {
  userId: number;
  dailyEntryId: number;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(async tx => {
    const [entry] = await tx
      .select()
      .from(accountingDailyEntries)
      .where(
        and(
          eq(accountingDailyEntries.id, input.dailyEntryId),
          eq(accountingDailyEntries.companyId, context.company.id)
        )
      )
      .limit(1);
    if (!entry || entry.status !== "draft")
      throw new Error("لا يمكن إرسال هذا الإدخال للموافقة");
    if (entry.createdBy !== input.userId)
      throw new Error("يمكن لمنشئ الإدخال فقط إرساله للموافقة");
    await tx
      .update(accountingDailyEntries)
      .set({ status: "pendingApproval" })
      .where(eq(accountingDailyEntries.id, entry.id));
    await tx.insert(accountingApprovals).values({
      entityType: "dailyEntry",
      entityId: entry.id,
      action: "post",
      requestedBy: input.userId,
    });
    await tx.insert(accountingAuditEvents).values({
      entityType: "dailyEntry",
      entityId: entry.id,
      action: "submittedForApproval",
      afterJson: JSON.stringify({ entryNumber: entry.entryNumber }),
      performedBy: input.userId,
    });
    return { dailyEntryId: entry.id, status: "pendingApproval" as const };
  });
}

export async function postDailyEntry(input: {
  userId: number;
  dailyEntryId: number;
  allowPendingApproval?: boolean;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(async tx => {
    const [entry] = await tx
      .select()
      .from(accountingDailyEntries)
      .where(
        and(
          eq(accountingDailyEntries.id, input.dailyEntryId),
          eq(accountingDailyEntries.companyId, context.company.id)
        )
      )
      .limit(1);
    if (!entry) throw new Error("الإدخال اليومي غير موجود");
    const approving = input.allowPendingApproval === true;
    if (
      entry.status !== "draft" &&
      !(approving && entry.status === "pendingApproval")
    )
      throw new Error("لا يمكن ترحيل هذا الإدخال مرة أخرى");
    if (approving && entry.createdBy === input.userId)
      throw new Error("لا يجوز اعتماد الإدخال من منشئه نفسه");
    if (entry.fiscalPeriodId !== context.period.id)
      throw new Error("الإدخال يتبع فترة مالية مغلقة أو غير مفتوحة");
    const debitBase = Number(entry.baseAmountMinor);
    const creditBase = Number(entry.baseAmountMinor);
    const lines = [
      {
        accountId: entry.debitAccountId,
        costCenterId: entry.costCenterId,
        currencyCode: entry.currencyCode,
        exchangeRatePpm: Number(entry.exchangeRatePpm),
        debitMinor: Number(entry.amountMinor),
        creditMinor: 0,
        baseDebitMinor: debitBase,
        baseCreditMinor: 0,
        memo: entry.description,
      },
      {
        accountId: entry.creditAccountId,
        costCenterId: entry.costCenterId,
        currencyCode: entry.currencyCode,
        exchangeRatePpm: Number(entry.exchangeRatePpm),
        debitMinor: 0,
        creditMinor: Number(entry.amountMinor),
        baseDebitMinor: 0,
        baseCreditMinor: creditBase,
        memo: entry.description,
      },
    ];
    assertBalancedJournal(lines);
    const journalInserted = await tx.insert(accountingJournalEntries).values({
      companyId: context.company.id,
      branchId: entry.branchId,
      fiscalPeriodId: entry.fiscalPeriodId,
      entryNumber: entry.entryNumber,
      entryDate: entry.entryDate,
      sourceType: "dailyEntry",
      sourceId: entry.id,
      status: "posted",
      memo: entry.description,
      postedBy: input.userId,
      postedAt: new Date(),
      createdBy: entry.createdBy,
    });
    const journalEntryId = Number(journalInserted[0].insertId);
    await tx
      .insert(accountingJournalLines)
      .values(lines.map(line => ({ ...line, journalEntryId })));
    await tx
      .update(accountingDailyEntries)
      .set({
        status: "posted",
        journalEntryId,
        postedBy: input.userId,
        postedAt: new Date(),
      })
      .where(eq(accountingDailyEntries.id, entry.id));
    await tx.insert(accountingAuditEvents).values({
      entityType: "dailyEntry",
      entityId: entry.id,
      action: "posted",
      afterJson: JSON.stringify({
        journalEntryId,
        entryNumber: entry.entryNumber,
      }),
      performedBy: input.userId,
    });
    if (approving)
      await tx
        .update(accountingApprovals)
        .set({
          status: "approved",
          decidedBy: input.userId,
          decidedAt: new Date(),
        })
        .where(
          and(
            eq(accountingApprovals.entityType, "dailyEntry"),
            eq(accountingApprovals.entityId, entry.id),
            eq(accountingApprovals.status, "pending")
          )
        );
    return {
      dailyEntryId: entry.id,
      journalEntryId,
      status: "posted" as const,
    };
  });
}

export async function approveDailyEntry(input: {
  userId: number;
  dailyEntryId: number;
}) {
  return postDailyEntry({ ...input, allowPendingApproval: true });
}

export async function listJournalEntries(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const entries = await db
    .select()
    .from(accountingJournalEntries)
    .where(eq(accountingJournalEntries.companyId, company.id))
    .orderBy(desc(accountingJournalEntries.entryDate))
    .limit(100);
  const attributedLines = entries.length
    ? await db
        .select({
          journalEntryId: accountingJournalLines.journalEntryId,
          code: accountingCostCenters.code,
          name: accountingCostCenters.name,
        })
        .from(accountingJournalLines)
        .innerJoin(
          accountingCostCenters,
          eq(accountingJournalLines.costCenterId, accountingCostCenters.id)
        )
        .where(
          inArray(
            accountingJournalLines.journalEntryId,
            entries.map(entry => entry.id)
          )
        )
    : [];
  const centersByEntry = new Map<number, string[]>();
  for (const line of attributedLines)
    centersByEntry.set(
      line.journalEntryId,
      Array.from(
        new Set([
          ...(centersByEntry.get(line.journalEntryId) ?? []),
          `${line.code} — ${line.name}`,
        ])
      )
    );
  return entries.map(entry => ({
    ...entry,
    costCenters: centersByEntry.get(entry.id) ?? [],
  }));
}

export async function listEmployees(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select()
    .from(accountingEmployees)
    .where(eq(accountingEmployees.companyId, company.id))
    .orderBy(asc(accountingEmployees.fullName));
}

export async function listEmployeeContracts(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      contract: accountingEmployeeContracts,
      employeeName: accountingEmployees.fullName,
    })
    .from(accountingEmployeeContracts)
    .innerJoin(
      accountingEmployees,
      eq(accountingEmployeeContracts.employeeId, accountingEmployees.id)
    )
    .where(eq(accountingEmployeeContracts.companyId, company.id))
    .orderBy(desc(accountingEmployeeContracts.startsOn));
}

export async function createEmployeeContract(input: {
  userId: number;
  employeeId: number;
  contractNumber: string;
  contractType: "permanent" | "fixedTerm" | "partTime" | "consultant";
  startsOn: Date;
  endsOn?: Date;
  baseSalaryMinor: number;
  currencyCode: string;
  allowances: Array<{ name: string; amountMinor: number }>;
  insuranceRateBps: number;
  taxRateBps: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [employee] = await db
    .select({ id: accountingEmployees.id })
    .from(accountingEmployees)
    .where(
      and(
        eq(accountingEmployees.id, input.employeeId),
        eq(accountingEmployees.companyId, company.id)
      )
    )
    .limit(1);
  if (!employee) throw new Error("الموظف لا يتبع الشركة الحالية");
  if (input.endsOn && input.endsOn < input.startsOn)
    throw new Error("نهاية العقد يجب أن تكون بعد بدايته");
  if (
    input.insuranceRateBps < 0 ||
    input.insuranceRateBps > 10000 ||
    input.taxRateBps < 0 ||
    input.taxRateBps > 10000
  )
    throw new Error("نسبة التأمين أو الضريبة يجب أن تكون بين 0% و100%");
  const result = await db.insert(accountingEmployeeContracts).values({
    companyId: company.id,
    employeeId: input.employeeId,
    contractNumber: input.contractNumber,
    contractType: input.contractType,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    baseSalaryMinor: input.baseSalaryMinor,
    currencyCode: input.currencyCode.toUpperCase(),
    allowancesJson: JSON.stringify(
      input.allowances.map(item => ({
        name: item.name.trim(),
        amountMinor: Math.max(0, Math.round(item.amountMinor)),
      }))
    ),
    insuranceRateBps: input.insuranceRateBps,
    taxRateBps: input.taxRateBps,
    createdBy: input.userId,
  });
  return { id: Number(result[0].insertId) };
}

export async function listEmployeeLeaves(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      leave: accountingEmployeeLeaves,
      employeeName: accountingEmployees.fullName,
    })
    .from(accountingEmployeeLeaves)
    .innerJoin(
      accountingEmployees,
      eq(accountingEmployeeLeaves.employeeId, accountingEmployees.id)
    )
    .where(eq(accountingEmployeeLeaves.companyId, company.id))
    .orderBy(desc(accountingEmployeeLeaves.startsOn));
}

export async function createEmployeeLeave(input: {
  userId: number;
  employeeId: number;
  leaveType: "annual" | "sick" | "unpaid" | "maternity" | "other";
  startsOn: Date;
  endsOn: Date;
  days: number;
  note?: string;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [employee] = await db
    .select({ id: accountingEmployees.id })
    .from(accountingEmployees)
    .where(
      and(
        eq(accountingEmployees.id, input.employeeId),
        eq(accountingEmployees.companyId, company.id)
      )
    )
    .limit(1);
  if (!employee) throw new Error("الموظف لا يتبع الشركة الحالية");
  if (input.endsOn < input.startsOn || input.days < 1)
    throw new Error("بيانات الإجازة غير صحيحة");
  const result = await db.insert(accountingEmployeeLeaves).values({
    companyId: company.id,
    employeeId: input.employeeId,
    leaveType: input.leaveType,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    days: input.days,
    note: input.note?.trim() || null,
    status: "pendingApproval",
    createdBy: input.userId,
  });
  return { id: Number(result[0].insertId), status: "pendingApproval" as const };
}

export async function approveEmployeeLeave(input: {
  userId: number;
  leaveId: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [leave] = await db
    .select()
    .from(accountingEmployeeLeaves)
    .where(
      and(
        eq(accountingEmployeeLeaves.id, input.leaveId),
        eq(accountingEmployeeLeaves.companyId, company.id),
        eq(accountingEmployeeLeaves.status, "pendingApproval")
      )
    )
    .limit(1);
  if (!leave) throw new Error("الإجازة غير جاهزة للاعتماد");
  await db
    .update(accountingEmployeeLeaves)
    .set({
      status: "approved",
      approvedBy: input.userId,
      approvedAt: new Date(),
    })
    .where(eq(accountingEmployeeLeaves.id, leave.id));
  await db.insert(accountingAuditEvents).values({
    entityType: "employeeLeave",
    entityId: leave.id,
    action: "approved",
    performedBy: input.userId,
  });
  return { status: "approved" as const };
}

export function calculatePolicyBPayrollLine(
  monthlySalaryMinor: number,
  attendance: Array<{
    status: "present" | "absent" | "leave" | "holiday";
    overtimeMinutes: number;
  }>
) {
  const workingDays = attendance.filter(
    entry => entry.status === "present"
  ).length;
  const overtimeMinutes = attendance.reduce(
    (total, entry) =>
      total + (entry.status === "present" ? entry.overtimeMinutes : 0),
    0
  );
  const overtimeMinor = Math.round(
    (monthlySalaryMinor * overtimeMinutes * 3) / (30 * 8 * 2 * 60)
  );
  const grossMinor = monthlySalaryMinor + overtimeMinor;
  return {
    workingDays,
    overtimeMinutes,
    overtimeMinor,
    grossMinor,
    netMinor: grossMinor,
  };
}

function parseContractAllowances(value: string | null | undefined) {
  if (!value) return 0;
  try {
    const allowances = JSON.parse(value) as Array<{ amountMinor?: number }>;
    return allowances.reduce(
      (total, allowance) =>
        total + Math.max(0, Math.round(Number(allowance.amountMinor ?? 0))),
      0
    );
  } catch {
    return 0;
  }
}

export function calculateAdvancedPayrollLine(
  monthlySalaryMinor: number,
  attendance: Array<{
    status: "present" | "absent" | "leave" | "holiday";
    overtimeMinutes: number;
  }>,
  contract?: {
    baseSalaryMinor: number;
    allowancesJson: string;
    insuranceRateBps: number;
    taxRateBps: number;
  }
) {
  const baseSalaryMinor = contract?.baseSalaryMinor ?? monthlySalaryMinor;
  const basic = calculatePolicyBPayrollLine(baseSalaryMinor, attendance);
  const allowancesMinor = parseContractAllowances(contract?.allowancesJson);
  const grossMinor = basic.grossMinor + allowancesMinor;
  const insuranceMinor = Math.round(
    (grossMinor * Math.max(0, contract?.insuranceRateBps ?? 0)) / 10000
  );
  const taxMinor = Math.round(
    (grossMinor * Math.max(0, contract?.taxRateBps ?? 0)) / 10000
  );
  return {
    ...basic,
    allowancesMinor,
    grossMinor,
    insuranceMinor,
    taxMinor,
    netMinor: Math.max(0, grossMinor - insuranceMinor - taxMinor),
  };
}

export async function createPayrollRunInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: {
    company: { id: number };
    branch: { id: number };
    period: { id: number };
  },
  input: { userId: number; name: string; periodStart: Date; periodEnd: Date }
) {
  const periodStart = new Date(input.periodStart);
  periodStart.setUTCHours(0, 0, 0, 0);
  const periodEnd = new Date(input.periodEnd);
  periodEnd.setUTCHours(23, 59, 59, 0);
  if (periodEnd < periodStart)
    throw new Error("تاريخ نهاية مسير الرواتب يجب أن يكون بعد تاريخ البداية");
  const employees = await tx
    .select()
    .from(accountingEmployees)
    .where(
      and(
        eq(accountingEmployees.companyId, context.company.id),
        eq(accountingEmployees.isActive, true)
      )
    );
  const attendanceRecords = employees.length
    ? await tx
        .select()
        .from(accountingAttendance)
        .where(
          and(
            inArray(
              accountingAttendance.employeeId,
              employees.map(employee => employee.id)
            ),
            gte(accountingAttendance.workDate, periodStart),
            lte(accountingAttendance.workDate, periodEnd)
          )
        )
    : [];
  if (attendanceRecords.some(entry => entry.approvalStatus !== "approved"))
    throw new Error(
      "لا يمكن إنشاء مسير رواتب قبل اعتماد جميع سجلات الحضور ضمن الفترة"
    );
  const attendance = attendanceRecords.filter(
    entry => entry.approvalStatus === "approved"
  );
  const contracts = employees.length
    ? await tx
        .select()
        .from(accountingEmployeeContracts)
        .where(
          and(
            eq(accountingEmployeeContracts.companyId, context.company.id),
            inArray(
              accountingEmployeeContracts.employeeId,
              employees.map(employee => employee.id)
            ),
            eq(accountingEmployeeContracts.status, "active")
          )
        )
    : [];
  const contractByEmployee = new Map(
    contracts.map(contract => [contract.employeeId, contract])
  );
  const result = await tx.insert(accountingPayrollRuns).values({
    companyId: context.company.id,
    branchId: context.branch.id,
    fiscalPeriodId: context.period.id,
    name: input.name,
    periodStart,
    periodEnd,
    createdBy: input.userId,
  });
  const payrollRunId = Number(result[0].insertId);
  if (employees.length)
    await tx.insert(accountingPayrollLines).values(
      employees.map(employee => {
        const calculation = calculateAdvancedPayrollLine(
          employee.monthlySalaryMinor,
          attendance.filter(entry => entry.employeeId === employee.id),
          contractByEmployee.get(employee.id)
        );
        return {
          payrollRunId,
          employeeId: employee.id,
          ...calculation,
          advanceMinor: 0,
          deductionMinor: 0,
        };
      })
    );
  return { id: payrollRunId, employeeCount: employees.length };
}

export async function createPayrollRun(input: {
  userId: number;
  name: string;
  periodStart: Date;
  periodEnd: Date;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    createPayrollRunInTransaction(tx as never, context, input)
  );
}

export async function submitPayrollForApproval(
  payrollRunId: number,
  userId: number
) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const runs = await db
    .select()
    .from(accountingPayrollRuns)
    .where(
      and(
        eq(accountingPayrollRuns.id, payrollRunId),
        eq(accountingPayrollRuns.companyId, company.id),
        eq(accountingPayrollRuns.status, "draft")
      )
    )
    .limit(1);
  if (!runs[0]) throw new Error("مسير الرواتب غير جاهز للإرسال");
  await db.transaction(async tx => {
    await tx
      .update(accountingPayrollRuns)
      .set({ status: "pendingApproval" })
      .where(eq(accountingPayrollRuns.id, payrollRunId));
    await tx.insert(accountingApprovals).values({
      entityType: "payroll",
      entityId: payrollRunId,
      action: "post",
      requestedBy: userId,
    });
  });
  return { status: "pendingApproval" as const };
}

export async function approveAndPostPayroll(
  payrollRunId: number,
  approverId: number
) {
  const db = await dbOrThrow();
  const context = await setupContext(approverId);
  return db.transaction(async tx => {
    const runs = await tx
      .select()
      .from(accountingPayrollRuns)
      .where(
        and(
          eq(accountingPayrollRuns.id, payrollRunId),
          eq(accountingPayrollRuns.companyId, context.company.id),
          eq(accountingPayrollRuns.status, "pendingApproval")
        )
      )
      .limit(1);
    const run = runs[0];
    if (!run) throw new Error("مسير الرواتب غير جاهز للاعتماد");
    assertApproverSeparation(run.createdBy, approverId);
    if (
      run.fiscalPeriodId !== context.period.id ||
      context.period.status !== "open"
    )
      throw new Error("الفترة المالية غير مفتوحة للترحيل");
    const payrollLines = await tx
      .select()
      .from(accountingPayrollLines)
      .where(eq(accountingPayrollLines.payrollRunId, payrollRunId));
    const totalGross = payrollLines.reduce(
      (total, line) => total + Number(line.grossMinor),
      0
    );
    const totalNet = payrollLines.reduce(
      (total, line) => total + Number(line.netMinor),
      0
    );
    const totalInsurance = payrollLines.reduce(
      (total, line) => total + Number(line.insuranceMinor),
      0
    );
    const totalTax = payrollLines.reduce(
      (total, line) => total + Number(line.taxMinor),
      0
    );
    if (totalGross <= 0) throw new Error("لا يمكن ترحيل مسير رواتب فارغ");
    await ensurePayrollAccounts(tx as never, context.company.id);
    const accounts = await tx
      .select({ id: accountingAccounts.id, code: accountingAccounts.code })
      .from(accountingAccounts)
      .where(eq(accountingAccounts.companyId, context.company.id));
    const accountMap = Object.fromEntries(
      accounts.map(account => [account.code, account.id])
    );
    if (
      !accountMap["6200"] ||
      !accountMap["2210"] ||
      !accountMap["2220"] ||
      !accountMap["2230"]
    )
      throw new Error("حسابات الرواتب غير مكتملة");
    const lines = [
      {
        accountId: accountMap["6200"],
        debitMinor: totalGross,
        creditMinor: 0,
        baseDebitMinor: totalGross,
        baseCreditMinor: 0,
      },
      {
        accountId: accountMap["2210"],
        debitMinor: 0,
        creditMinor: totalNet,
        baseDebitMinor: 0,
        baseCreditMinor: totalNet,
      },
      {
        accountId: accountMap["2220"],
        debitMinor: 0,
        creditMinor: totalInsurance,
        baseDebitMinor: 0,
        baseCreditMinor: totalInsurance,
      },
      {
        accountId: accountMap["2230"],
        debitMinor: 0,
        creditMinor: totalTax,
        baseDebitMinor: 0,
        baseCreditMinor: totalTax,
      },
    ];
    assertBalancedJournal(lines);
    const entryResult = await tx.insert(accountingJournalEntries).values({
      companyId: context.company.id,
      branchId: run.branchId ?? context.branch.id,
      fiscalPeriodId: run.fiscalPeriodId,
      entryNumber: `PAY-${run.id}`,
      entryDate: new Date(),
      sourceType: "payroll",
      sourceId: run.id,
      status: "posted",
      memo: run.name,
      postedBy: approverId,
      postedAt: new Date(),
      createdBy: approverId,
    });
    const journalEntryId = Number(entryResult[0].insertId);
    await tx.insert(accountingJournalLines).values(
      lines.map(line => ({
        journalEntryId,
        accountId: line.accountId,
        currencyCode: "USD",
        exchangeRatePpm: 1_000_000,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        baseDebitMinor: line.baseDebitMinor,
        baseCreditMinor: line.baseCreditMinor,
      }))
    );
    await tx
      .update(accountingPayrollRuns)
      .set({ status: "posted", approvedBy: approverId, journalEntryId })
      .where(eq(accountingPayrollRuns.id, payrollRunId));
    await tx
      .update(accountingApprovals)
      .set({ status: "approved", decidedBy: approverId, decidedAt: new Date() })
      .where(
        and(
          eq(accountingApprovals.entityType, "payroll"),
          eq(accountingApprovals.entityId, payrollRunId),
          eq(accountingApprovals.status, "pending")
        )
      );
    await tx.insert(accountingAuditEvents).values({
      entityType: "payroll",
      entityId: payrollRunId,
      action: "posted",
      afterJson: JSON.stringify({ journalEntryId, totalGross }),
      performedBy: approverId,
    });
    return { journalEntryId, status: "posted" as const };
  });
}

export async function listPayrollRunDetails(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const runs = await db
    .select()
    .from(accountingPayrollRuns)
    .where(eq(accountingPayrollRuns.companyId, company.id))
    .orderBy(desc(accountingPayrollRuns.createdAt))
    .limit(24);
  const lines = runs.length
    ? await db
        .select({
          payrollRunId: accountingPayrollLines.payrollRunId,
          employeeId: accountingPayrollLines.employeeId,
          employeeName: accountingEmployees.fullName,
          workingDays: accountingPayrollLines.workingDays,
          overtimeMinutes: accountingPayrollLines.overtimeMinutes,
          overtimeMinor: accountingPayrollLines.overtimeMinor,
          allowancesMinor: accountingPayrollLines.allowancesMinor,
          grossMinor: accountingPayrollLines.grossMinor,
          insuranceMinor: accountingPayrollLines.insuranceMinor,
          taxMinor: accountingPayrollLines.taxMinor,
          advanceMinor: accountingPayrollLines.advanceMinor,
          deductionMinor: accountingPayrollLines.deductionMinor,
          netMinor: accountingPayrollLines.netMinor,
        })
        .from(accountingPayrollLines)
        .innerJoin(
          accountingEmployees,
          eq(accountingPayrollLines.employeeId, accountingEmployees.id)
        )
        .where(
          inArray(
            accountingPayrollLines.payrollRunId,
            runs.map(run => run.id)
          )
        )
        .orderBy(asc(accountingEmployees.fullName))
    : [];
  return { runs, lines };
}

export async function getFiscalCloseReadinessInTransaction(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  periodId: number
) {
  const [documents, payrollRuns, unpostedJournals, postedJournalLines] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(accountingDocuments)
        .where(
          and(
            eq(accountingDocuments.fiscalPeriodId, periodId),
            sql`${accountingDocuments.status} not in ('posted', 'cancelled')`
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(accountingPayrollRuns)
        .where(
          and(
            eq(accountingPayrollRuns.fiscalPeriodId, periodId),
            sql`${accountingPayrollRuns.status} != 'posted'`
          )
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(accountingJournalEntries)
        .where(
          and(
            eq(accountingJournalEntries.fiscalPeriodId, periodId),
            sql`${accountingJournalEntries.status} != 'posted'`
          )
        ),
      db
        .select({
          entryId: accountingJournalLines.journalEntryId,
          debit: accountingJournalLines.baseDebitMinor,
          credit: accountingJournalLines.baseCreditMinor,
        })
        .from(accountingJournalLines)
        .innerJoin(
          accountingJournalEntries,
          eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)
        )
        .where(
          and(
            eq(accountingJournalEntries.fiscalPeriodId, periodId),
            eq(accountingJournalEntries.status, "posted")
          )
        ),
    ]);
  const balances = new Map<number, { debit: number; credit: number }>();
  for (const line of postedJournalLines) {
    const balance = balances.get(line.entryId) ?? { debit: 0, credit: 0 };
    balance.debit += Number(line.debit);
    balance.credit += Number(line.credit);
    balances.set(line.entryId, balance);
  }
  const totalDebitMinor = Array.from(balances.values()).reduce(
    (total, balance) => total + balance.debit,
    0
  );
  const totalCreditMinor = Array.from(balances.values()).reduce(
    (total, balance) => total + balance.credit,
    0
  );
  const unbalancedJournalEntries = Array.from(balances.values()).filter(
    balance => balance.debit !== balance.credit
  ).length;
  const unpostedDocuments = Number(documents[0]?.count ?? 0);
  const unpostedPayrollRuns = Number(payrollRuns[0]?.count ?? 0);
  const unpostedJournalEntries = Number(unpostedJournals[0]?.count ?? 0);
  return {
    unpostedDocuments,
    unpostedPayrollRuns,
    unpostedJournalEntries,
    unbalancedJournalEntries,
    totalDebitMinor,
    totalCreditMinor,
    canClose:
      unpostedDocuments === 0 &&
      unpostedPayrollRuns === 0 &&
      unpostedJournalEntries === 0 &&
      unbalancedJournalEntries === 0 &&
      totalDebitMinor === totalCreditMinor,
  };
}

export async function getFiscalCloseReadiness(userId: number) {
  const db = await dbOrThrow();
  const { period } = await setupContext(userId);
  return getFiscalCloseReadinessInTransaction(db, period.id);
}

export async function getAccountingConfiguration(userId: number) {
  const db = await dbOrThrow();
  const { company, period } = await setupContext(userId);
  const [
    branches,
    currencies,
    roles,
    employees,
    priceLists,
    usersList,
    paymentAccounts,
    payrollRuns,
    costCenters,
    closeReadiness,
    companyBranding,
  ] = await Promise.all([
    db
      .select()
      .from(accountingBranches)
      .where(eq(accountingBranches.companyId, company.id))
      .orderBy(asc(accountingBranches.code)),
    db
      .select()
      .from(accountingCurrencies)
      .where(eq(accountingCurrencies.isActive, true))
      .orderBy(asc(accountingCurrencies.code)),
    db
      .select()
      .from(accountingRoles)
      .where(eq(accountingRoles.companyId, company.id))
      .orderBy(asc(accountingRoles.name)),
    db
      .select()
      .from(accountingEmployees)
      .where(eq(accountingEmployees.companyId, company.id))
      .orderBy(asc(accountingEmployees.fullName)),
    db
      .select()
      .from(accountingPriceLists)
      .where(eq(accountingPriceLists.companyId, company.id))
      .orderBy(asc(accountingPriceLists.name)),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        username: users.username,
        isInternalUser: users.isInternalUser,
        isActive: users.isActive,
        lastInternalSignedIn: users.lastInternalSignedIn,
      })
      .from(users)
      .innerJoin(accountingUserRoles, eq(accountingUserRoles.userId, users.id))
      .innerJoin(
        accountingRoles,
        eq(accountingUserRoles.roleId, accountingRoles.id)
      )
      .where(eq(accountingRoles.companyId, company.id))
      .groupBy(
        users.id,
        users.name,
        users.email,
        users.role,
        users.username,
        users.isInternalUser,
        users.isActive,
        users.lastInternalSignedIn
      )
      .orderBy(asc(users.name)),
    db
      .select()
      .from(accountingPaymentAccounts)
      .where(eq(accountingPaymentAccounts.companyId, company.id))
      .orderBy(asc(accountingPaymentAccounts.name)),
    db
      .select()
      .from(accountingPayrollRuns)
      .where(eq(accountingPayrollRuns.companyId, company.id))
      .orderBy(desc(accountingPayrollRuns.createdAt)),
    db
      .select()
      .from(accountingCostCenters)
      .where(eq(accountingCostCenters.companyId, company.id))
      .orderBy(asc(accountingCostCenters.code)),
    getFiscalCloseReadinessInTransaction(db, period.id),
    db
      .select({
        brandName: accountingCompanies.brandName,
        brandLogoUrl: accountingCompanies.brandLogoUrl,
        brandLogoKey: accountingCompanies.brandLogoKey,
        showProductName: accountingCompanies.showProductName,
        countryCode: accountingCompanies.countryCode,
      })
      .from(accountingCompanies)
      .where(eq(accountingCompanies.id, company.id))
      .limit(1),
  ]);
  const [assignments, rolePermissions] = await Promise.all([
    db
      .select({
        id: accountingUserRoles.id,
        userId: accountingUserRoles.userId,
        roleId: accountingUserRoles.roleId,
        roleName: accountingRoles.name,
        roleCode: accountingRoles.code,
        branchId: accountingUserRoles.branchId,
        assignedBy: accountingUserRoles.assignedBy,
      })
      .from(accountingUserRoles)
      .innerJoin(
        accountingRoles,
        eq(accountingUserRoles.roleId, accountingRoles.id)
      )
      .where(eq(accountingRoles.companyId, company.id)),
    db
      .select({
        roleId: accountingRolePermissions.roleId,
        permission: accountingRolePermissions.permission,
        isAllowed: accountingRolePermissions.isAllowed,
      })
      .from(accountingRolePermissions)
      .innerJoin(
        accountingRoles,
        eq(accountingRolePermissions.roleId, accountingRoles.id)
      )
      .where(eq(accountingRoles.companyId, company.id)),
  ]);
  return {
    branches,
    currencies,
    roles,
    employees,
    priceLists,
    users: usersList,
    assignments,
    rolePermissions,
    paymentAccounts,
    payrollRuns,
    costCenters,
    closeReadiness,
    companyBranding: companyBranding[0] ?? {
      brandName: null,
      brandLogoUrl: null,
      brandLogoKey: null,
      showProductName: true,
      countryCode: "IQ",
    },
  };
}

export async function getPublicCompanyBranding() {
  const db = await dbOrThrow();
  const [company] = await db
    .select({
      brandName: accountingCompanies.brandName,
      brandLogoUrl: accountingCompanies.brandLogoUrl,
      showProductName: accountingCompanies.showProductName,
    })
    .from(accountingCompanies)
    .where(eq(accountingCompanies.companyKey, "PRIMARY"))
    .limit(1);
  return {
    brandName: company?.brandName ?? null,
    brandLogoUrl: company?.brandLogoUrl ?? null,
    showProductName: company?.showProductName ?? true,
  };
}

export async function updateCompanyBranding(input: {
  userId: number;
  brandName: string;
  brandLogoUrl: string | null;
  brandLogoKey: string | null;
  showProductName: boolean;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [current] = await db
    .select({
      brandName: accountingCompanies.brandName,
      brandLogoUrl: accountingCompanies.brandLogoUrl,
      brandLogoKey: accountingCompanies.brandLogoKey,
      showProductName: accountingCompanies.showProductName,
    })
    .from(accountingCompanies)
    .where(eq(accountingCompanies.id, company.id))
    .limit(1);
  if (!current) throw new Error("تعذر العثور على هوية الشركة");
  const after = {
    brandName: input.brandName.trim(),
    brandLogoUrl: input.brandLogoUrl,
    brandLogoKey: input.brandLogoKey,
    showProductName: input.showProductName,
  };
  await db.transaction(async tx => {
    await tx
      .update(accountingCompanies)
      .set(after)
      .where(eq(accountingCompanies.id, company.id));
    await tx.insert(accountingAuditEvents).values({
      entityType: "companyBranding",
      entityId: company.id,
      action: "updated",
      beforeJson: JSON.stringify(current),
      afterJson: JSON.stringify(after),
      performedBy: input.userId,
    });
  });
  return after;
}

export async function updateCompanyCountry(input: {
  userId: number;
  countryCode: "IQ" | "SY";
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [current] = await db
    .select({ countryCode: accountingCompanies.countryCode })
    .from(accountingCompanies)
    .where(eq(accountingCompanies.id, company.id))
    .limit(1);
  if (!current) throw new Error("تعذر العثور على إعدادات الشركة");
  await db.transaction(async tx => {
    await tx
      .update(accountingCompanies)
      .set({ countryCode: input.countryCode })
      .where(eq(accountingCompanies.id, company.id));
    await tx.insert(accountingAuditEvents).values({
      entityType: "companyConfiguration",
      entityId: company.id,
      action: "countryChanged",
      beforeJson: JSON.stringify(current),
      afterJson: JSON.stringify({ countryCode: input.countryCode }),
      performedBy: input.userId,
    });
  });
  return { countryCode: input.countryCode };
}

export async function getAccountingAccessConfiguration(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  const [branches, roles, usersList, assignments, rolePermissions] =
    await Promise.all([
      db
        .select({
          id: accountingBranches.id,
          code: accountingBranches.code,
          name: accountingBranches.name,
          isActive: accountingBranches.isActive,
        })
        .from(accountingBranches)
        .where(eq(accountingBranches.companyId, company.id))
        .orderBy(asc(accountingBranches.code)),
      db
        .select()
        .from(accountingRoles)
        .where(eq(accountingRoles.companyId, company.id))
        .orderBy(asc(accountingRoles.name)),
      db
        .select({
          id: users.id,
          name: users.name,
          username: users.username,
          isInternalUser: users.isInternalUser,
          isActive: users.isActive,
          lastInternalSignedIn: users.lastInternalSignedIn,
        })
        .from(users)
        .innerJoin(
          accountingUserRoles,
          eq(accountingUserRoles.userId, users.id)
        )
        .innerJoin(
          accountingRoles,
          eq(accountingUserRoles.roleId, accountingRoles.id)
        )
        .where(eq(accountingRoles.companyId, company.id))
        .groupBy(
          users.id,
          users.name,
          users.username,
          users.isInternalUser,
          users.isActive,
          users.lastInternalSignedIn
        )
        .orderBy(asc(users.name)),
      db
        .select({
          id: accountingUserRoles.id,
          userId: accountingUserRoles.userId,
          roleId: accountingUserRoles.roleId,
          roleName: accountingRoles.name,
          roleCode: accountingRoles.code,
          branchId: accountingUserRoles.branchId,
          assignedBy: accountingUserRoles.assignedBy,
        })
        .from(accountingUserRoles)
        .innerJoin(
          accountingRoles,
          eq(accountingUserRoles.roleId, accountingRoles.id)
        )
        .where(eq(accountingRoles.companyId, company.id)),
      db
        .select({
          roleId: accountingRolePermissions.roleId,
          permission: accountingRolePermissions.permission,
          isAllowed: accountingRolePermissions.isAllowed,
        })
        .from(accountingRolePermissions)
        .innerJoin(
          accountingRoles,
          eq(accountingRolePermissions.roleId, accountingRoles.id)
        )
        .where(eq(accountingRoles.companyId, company.id)),
    ]);
  return { branches, roles, users: usersList, assignments, rolePermissions };
}

export async function getAccountingPermissionActivityPage(
  userId: number,
  page: number,
  pageSize: number
) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  await db
    .delete(accountingAuditEventArchive)
    .where(lte(accountingAuditEventArchive.expiresAt, new Date()));
  const companyUserIds = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(accountingUserRoles, eq(accountingUserRoles.userId, users.id))
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingRoles.companyId, company.id));
  if (!companyUserIds.length) return { events: [], total: 0, page, pageSize };
  const performedByIds = companyUserIds.map(row => row.id);
  const [events, countRows] = await Promise.all([
    db
      .select({
        id: accountingAuditEvents.id,
        entityType: accountingAuditEvents.entityType,
        entityId: accountingAuditEvents.entityId,
        action: accountingAuditEvents.action,
        beforeJson: accountingAuditEvents.beforeJson,
        afterJson: accountingAuditEvents.afterJson,
        performedBy: accountingAuditEvents.performedBy,
        performedByName: users.name,
        performedByUsername: users.username,
        createdAt: accountingAuditEvents.createdAt,
      })
      .from(accountingAuditEvents)
      .innerJoin(users, eq(accountingAuditEvents.performedBy, users.id))
      .where(inArray(accountingAuditEvents.performedBy, performedByIds))
      .orderBy(
        desc(accountingAuditEvents.createdAt),
        desc(accountingAuditEvents.id)
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`count(*)` })
      .from(accountingAuditEvents)
      .where(inArray(accountingAuditEvents.performedBy, performedByIds)),
  ]);
  return { events, total: Number(countRows[0]?.total ?? 0), page, pageSize };
}

async function getCompanyUserIds(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number
) {
  return db
    .select({ id: users.id })
    .from(users)
    .innerJoin(accountingUserRoles, eq(accountingUserRoles.userId, users.id))
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingRoles.companyId, companyId));
}

export async function archiveAccountingPermissionActivity(input: {
  userId: number;
  eventId: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const companyUserIds = await getCompanyUserIds(db, company.id);
  const performedByIds = companyUserIds.map(row => row.id);
  if (!performedByIds.length)
    throw new Error("لا يوجد سجل نشاط ضمن الشركة الحالية");
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(expiresAt.getMonth() + 3);
  await db.transaction(async tx => {
    await tx
      .delete(accountingAuditEventArchive)
      .where(lte(accountingAuditEventArchive.expiresAt, now));
    const [event] = await tx
      .select()
      .from(accountingAuditEvents)
      .where(
        and(
          eq(accountingAuditEvents.id, input.eventId),
          inArray(accountingAuditEvents.performedBy, performedByIds)
        )
      )
      .limit(1);
    if (!event)
      throw new Error("سجل النشاط غير موجود أو لا ينتمي إلى الشركة الحالية");
    await tx.insert(accountingAuditEventArchive).values({
      originalEventId: event.id,
      entityType: event.entityType,
      entityId: event.entityId,
      action: event.action,
      beforeJson: event.beforeJson,
      afterJson: event.afterJson,
      reason: event.reason,
      performedBy: event.performedBy,
      createdAt: event.createdAt,
      archivedBy: input.userId,
      archivedAt: now,
      expiresAt,
    });
    await tx
      .delete(accountingAuditEvents)
      .where(eq(accountingAuditEvents.id, event.id));
  });
  return { success: true, expiresAt };
}

export async function getAccountingPermissionActivityArchivePage(
  userId: number,
  page: number,
  pageSize: number
) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  await db
    .delete(accountingAuditEventArchive)
    .where(lte(accountingAuditEventArchive.expiresAt, new Date()));
  const companyUserIds = await getCompanyUserIds(db, company.id);
  const performedByIds = companyUserIds.map(row => row.id);
  if (!performedByIds.length) return { events: [], total: 0, page, pageSize };
  const [events, countRows] = await Promise.all([
    db
      .select({
        id: accountingAuditEventArchive.id,
        originalEventId: accountingAuditEventArchive.originalEventId,
        entityType: accountingAuditEventArchive.entityType,
        entityId: accountingAuditEventArchive.entityId,
        action: accountingAuditEventArchive.action,
        beforeJson: accountingAuditEventArchive.beforeJson,
        afterJson: accountingAuditEventArchive.afterJson,
        performedBy: accountingAuditEventArchive.performedBy,
        performedByName: users.name,
        performedByUsername: users.username,
        createdAt: accountingAuditEventArchive.createdAt,
        archivedAt: accountingAuditEventArchive.archivedAt,
        expiresAt: accountingAuditEventArchive.expiresAt,
      })
      .from(accountingAuditEventArchive)
      .innerJoin(users, eq(accountingAuditEventArchive.performedBy, users.id))
      .where(inArray(accountingAuditEventArchive.performedBy, performedByIds))
      .orderBy(
        desc(accountingAuditEventArchive.archivedAt),
        desc(accountingAuditEventArchive.id)
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`count(*)` })
      .from(accountingAuditEventArchive)
      .where(inArray(accountingAuditEventArchive.performedBy, performedByIds)),
  ]);
  return { events, total: Number(countRows[0]?.total ?? 0), page, pageSize };
}

export async function createCostCenter(input: {
  userId: number;
  code: string;
  name: string;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const code = input.code.trim().toUpperCase();
  const existing = await db
    .select({ id: accountingCostCenters.id })
    .from(accountingCostCenters)
    .where(
      and(
        eq(accountingCostCenters.companyId, company.id),
        eq(accountingCostCenters.code, code)
      )
    )
    .limit(1);
  if (existing[0]) throw new Error("رمز مركز التكلفة مستخدم بالفعل");
  const result = await db
    .insert(accountingCostCenters)
    .values({ companyId: company.id, code, name: input.name.trim() });
  const id = Number(result[0].insertId);
  await db.insert(accountingAuditEvents).values({
    entityType: "costCenter",
    entityId: id,
    action: "created",
    afterJson: JSON.stringify({ code, name: input.name.trim() }),
    performedBy: input.userId,
  });
  return { id, code };
}

export async function updateCostCenter(input: {
  userId: number;
  costCenterId: number;
  name: string;
  isActive: boolean;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [existing] = await db
    .select()
    .from(accountingCostCenters)
    .where(
      and(
        eq(accountingCostCenters.id, input.costCenterId),
        eq(accountingCostCenters.companyId, company.id)
      )
    )
    .limit(1);
  if (!existing) throw new Error("مركز التكلفة غير موجود ضمن الشركة الحالية");
  const after = { name: input.name.trim(), isActive: input.isActive };
  await db
    .update(accountingCostCenters)
    .set(after)
    .where(eq(accountingCostCenters.id, existing.id));
  await db.insert(accountingAuditEvents).values({
    entityType: "costCenter",
    entityId: existing.id,
    action: "updated",
    beforeJson: JSON.stringify({
      name: existing.name,
      isActive: existing.isActive,
    }),
    afterJson: JSON.stringify(after),
    performedBy: input.userId,
  });
  return { id: existing.id, ...after };
}

export async function listActiveCostCentersInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number
) {
  return tx
    .select()
    .from(accountingCostCenters)
    .where(
      and(
        eq(accountingCostCenters.companyId, companyId),
        eq(accountingCostCenters.isActive, true)
      )
    )
    .orderBy(asc(accountingCostCenters.code));
}

export async function listActiveCostCenters(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return listActiveCostCentersInTransaction(db, company.id);
}

export async function createAccountingBranch(input: {
  userId: number;
  code: string;
  name: string;
  warehouseName: string;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(async tx => {
    const branchResult = await tx.insert(accountingBranches).values({
      companyId: company.id,
      code: input.code.toUpperCase(),
      name: input.name,
    });
    const branchId = Number(branchResult[0].insertId);
    await tx.insert(accountingWarehouses).values({
      branchId,
      code: `${input.code.toUpperCase()}-WH`,
      name: input.warehouseName,
    });
    await tx.insert(accountingAuditEvents).values({
      entityType: "branch",
      entityId: branchId,
      action: "created",
      afterJson: JSON.stringify(input),
      performedBy: input.userId,
    });
    return { id: branchId };
  });
}

export async function createAccountingEmployee(input: {
  userId: number;
  fullName: string;
  employeeNumber: string;
  jobTitle?: string;
  salaryAmount: number;
  salaryCurrencyCode: string;
  salaryExchangeRate: number;
  branchId?: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(tx =>
    createAccountingEmployeeInTransaction(tx as never, company, input)
  );
}

export async function createAccountingEmployeeInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  company: { id: number; baseCurrencyCode: string },
  input: {
    userId: number;
    fullName: string;
    employeeNumber: string;
    jobTitle?: string;
    salaryAmount: number;
    salaryCurrencyCode: string;
    salaryExchangeRate: number;
    branchId?: number;
  }
) {
  const [currency] = await tx
    .select({
      code: accountingCurrencies.code,
      decimalPlaces: accountingCurrencies.decimalPlaces,
    })
    .from(accountingCurrencies)
    .where(
      and(
        eq(accountingCurrencies.code, input.salaryCurrencyCode),
        eq(accountingCurrencies.isActive, true)
      )
    )
    .limit(1);
  if (!currency) throw new Error("عملة الراتب غير نشطة أو غير صالحة");
  if (
    input.salaryCurrencyCode === company.baseCurrencyCode &&
    input.salaryExchangeRate !== 1
  )
    throw new Error("سعر تحويل راتب الدولار يجب أن يساوي 1");
  if (input.branchId) {
    const [branch] = await tx
      .select({ id: accountingBranches.id })
      .from(accountingBranches)
      .where(
        and(
          eq(accountingBranches.id, input.branchId),
          eq(accountingBranches.companyId, company.id)
        )
      )
      .limit(1);
    if (!branch) throw new Error("فرع الموظف غير تابع للشركة الحالية");
  }
  const factor = 10 ** currency.decimalPlaces;
  const salaryInputMinor = Math.round(input.salaryAmount * factor);
  if (
    !Number.isSafeInteger(salaryInputMinor) ||
    salaryInputMinor < 0 ||
    Math.abs(salaryInputMinor / factor - input.salaryAmount) > 1e-8
  )
    throw new Error("قيمة راتب الموظف غير صالحة للعملة المختارة");
  const salaryExchangeRatePpm = Math.round(
    input.salaryExchangeRate * 1_000_000
  );
  if (
    !Number.isSafeInteger(salaryExchangeRatePpm) ||
    salaryExchangeRatePpm <= 0
  )
    throw new Error("سعر تحويل الراتب غير صالح");
  const monthlySalaryMinor = calculateBaseAmount(
    salaryInputMinor,
    salaryExchangeRatePpm
  );
  const result = await tx.insert(accountingEmployees).values({
    companyId: company.id,
    branchId: input.branchId ?? null,
    employeeNumber: input.employeeNumber,
    fullName: input.fullName,
    jobTitle: input.jobTitle ?? null,
    monthlySalaryMinor,
    salaryCurrencyCode: input.salaryCurrencyCode,
    salaryInputMinor,
    salaryExchangeRatePpm,
  });
  const id = Number(result[0].insertId);
  await tx.insert(accountingAuditEvents).values({
    entityType: "employee",
    entityId: id,
    action: "created",
    afterJson: JSON.stringify({
      fullName: input.fullName,
      employeeNumber: input.employeeNumber,
      salaryAmount: input.salaryAmount,
      salaryInputMinor,
      salaryCurrencyCode: input.salaryCurrencyCode,
      salaryExchangeRate: input.salaryExchangeRate,
      salaryExchangeRatePpm,
      monthlySalaryMinor,
    }),
    performedBy: input.userId,
  });
  return { id, monthlySalaryMinor };
}

export async function assignAccountingRoleInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: {
    userId: number;
    targetUserId: number;
    roleId: number;
    branchId?: number;
    isOwner: boolean;
    canGrantSystemAdmin?: boolean;
    allowUnassignedTarget?: boolean;
  }
) {
  const role = await tx
    .select()
    .from(accountingRoles)
    .where(
      and(
        eq(accountingRoles.id, input.roleId),
        eq(accountingRoles.companyId, companyId)
      )
    )
    .limit(1);
  if (!role[0]) throw new Error("الدور المحاسبي غير صالح");
  if (
    !input.isOwner &&
    !input.canGrantSystemAdmin &&
    role[0].code === "system_admin"
  )
    throw new Error(
      "لا يمكن منح دور مدير النظام إلا لمدير النظام الحالي أو المالك"
    );
  const target = await tx
    .select()
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!target[0]) throw new Error("المستخدم غير موجود");
  const membership = await tx
    .select({ id: accountingUserRoles.id })
    .from(accountingUserRoles)
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(
      and(
        eq(accountingUserRoles.userId, input.targetUserId),
        eq(accountingRoles.companyId, companyId)
      )
    )
    .limit(1);
  const anyMembership = !membership[0]
    ? await tx
        .select({ id: accountingUserRoles.id })
        .from(accountingUserRoles)
        .where(eq(accountingUserRoles.userId, input.targetUserId))
        .limit(1)
    : membership;
  if (!membership[0] && anyMembership[0] && !input.allowUnassignedTarget)
    throw new Error("لا يمكن منح دور لمستخدم خارج الشركة الحالية");
  if (input.branchId) {
    const branch = await tx
      .select({ id: accountingBranches.id })
      .from(accountingBranches)
      .where(
        and(
          eq(accountingBranches.id, input.branchId),
          eq(accountingBranches.companyId, companyId)
        )
      )
      .limit(1);
    if (!branch[0]) throw new Error("الفرع المقيد غير تابع للشركة الحالية");
  }
  await tx
    .delete(accountingUserRoles)
    .where(
      and(
        eq(accountingUserRoles.userId, input.targetUserId),
        eq(accountingUserRoles.roleId, input.roleId)
      )
    );
  await tx.insert(accountingUserRoles).values({
    userId: input.targetUserId,
    roleId: input.roleId,
    branchId: input.branchId ?? null,
    assignedBy: input.userId,
  });
  await tx.insert(accountingAuditEvents).values({
    entityType: "userRole",
    entityId: input.targetUserId,
    action: "assigned",
    afterJson: JSON.stringify(input),
    performedBy: input.userId,
  });
  return { success: true };
}

export async function assignAccountingRole(input: {
  userId: number;
  targetUserId: number;
  roleId: number;
  branchId?: number;
  isOwner: boolean;
  canGrantSystemAdmin?: boolean;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(tx =>
    assignAccountingRoleInTransaction(tx as never, company.id, input)
  );
}

export async function getAccountingRoleCodesInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  userId: number
) {
  const rows = await tx
    .select({ code: accountingRoles.code })
    .from(accountingUserRoles)
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(eq(accountingUserRoles.userId, userId));
  return rows.map(row => row.code);
}

export async function getAccountingRoleCodes(userId: number) {
  const db = await dbOrThrow();
  return getAccountingRoleCodesInTransaction(db, userId);
}

export async function getAccountingPermissionsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  userId: number
) {
  const rows = await tx
    .select({ permission: accountingRolePermissions.permission })
    .from(accountingUserRoles)
    .innerJoin(
      accountingRolePermissions,
      eq(accountingUserRoles.roleId, accountingRolePermissions.roleId)
    )
    .where(
      and(
        eq(accountingUserRoles.userId, userId),
        eq(accountingRolePermissions.isAllowed, true)
      )
    );
  return Array.from(new Set(rows.map(row => row.permission)));
}

export async function getAccountingPermissions(userId: number) {
  const db = await dbOrThrow();
  return getAccountingPermissionsInTransaction(db, userId);
}

export async function createInternalUserAccount(input: {
  userId: number;
  isOwner: boolean;
  canGrantSystemAdmin?: boolean;
  name: string;
  username: string;
  password: string;
  roleId: number;
  branchId?: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const username = normalizeUsername(input.username);
  const passwordHash = await hashInternalPassword(input.password);
  return db.transaction(async tx => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (existing[0]) throw new Error("اسم المستخدم مستخدم بالفعل");
    const result = await tx.insert(users).values({
      openId: `internal-${randomUUID()}`,
      name: input.name.trim(),
      loginMethod: "internal",
      username,
      passwordHash,
      isInternalUser: true,
      isActive: true,
      role: "user",
      lastSignedIn: new Date(),
    });
    const id = Number(result[0].insertId);
    await assignAccountingRoleInTransaction(tx as never, company.id, {
      userId: input.userId,
      targetUserId: id,
      roleId: input.roleId,
      branchId: input.branchId,
      isOwner: input.isOwner,
      canGrantSystemAdmin: input.canGrantSystemAdmin,
      allowUnassignedTarget: true,
    });
    await tx.insert(accountingAuditEvents).values({
      entityType: "internalUser",
      entityId: id,
      action: "created",
      afterJson: JSON.stringify({
        username,
        name: input.name.trim(),
        roleId: input.roleId,
        branchId: input.branchId ?? null,
      }),
      performedBy: input.userId,
    });
    return { id, username };
  });
}

export async function getInternalUserInCompanyInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  targetUserId: number
) {
  const [user] = await tx
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .innerJoin(accountingUserRoles, eq(accountingUserRoles.userId, users.id))
    .innerJoin(
      accountingRoles,
      eq(accountingUserRoles.roleId, accountingRoles.id)
    )
    .where(
      and(
        eq(users.id, targetUserId),
        eq(users.isInternalUser, true),
        eq(accountingRoles.companyId, companyId)
      )
    )
    .limit(1);
  if (!user)
    throw new Error("حساب المستخدم الداخلي غير موجود ضمن الشركة الحالية");
  return user;
}

export async function updateInternalUserAccount(input: {
  userId: number;
  targetUserId: number;
  isActive: boolean;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const user = await getInternalUserInCompanyInTransaction(
    db,
    company.id,
    input.targetUserId
  );
  await db
    .update(users)
    .set({ isActive: input.isActive })
    .where(eq(users.id, user.id));
  await db.insert(accountingAuditEvents).values({
    entityType: "internalUser",
    entityId: user.id,
    action: "updated",
    beforeJson: JSON.stringify({ isActive: user.isActive }),
    afterJson: JSON.stringify({ isActive: input.isActive }),
    performedBy: input.userId,
  });
  return { id: user.id, isActive: input.isActive };
}

export async function resetInternalUserPassword(input: {
  userId: number;
  targetUserId: number;
  password: string;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const user = await getInternalUserInCompanyInTransaction(
    db,
    company.id,
    input.targetUserId
  );
  const passwordHash = await hashInternalPassword(input.password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  // Invalidate every active session for the user, otherwise a stolen cookie
  // survives a password reset.
  await db
    .update(accountingInternalSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountingInternalSessions.userId, user.id),
        isNull(accountingInternalSessions.revokedAt)
      )
    );
  await db.insert(accountingAuditEvents).values({
    entityType: "internalUser",
    entityId: user.id,
    action: "passwordReset",
    afterJson: JSON.stringify({ passwordReset: true }),
    performedBy: input.userId,
  });
  return { id: user.id, passwordReset: true };
}

export async function createCustomAccountingRoleInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: {
    userId: number;
    isOwner: boolean;
    name: string;
    permissions: string[];
  }
) {
  const permissions = Array.from(new Set(input.permissions));
  if (
    !input.isOwner &&
    permissions.some(
      permission => permission === "*" || permission === "permissions.manage"
    )
  )
    throw new Error("لا يمكن للمدير المفوض إنشاء دور يملك صلاحيات المالك");
  const result = await tx.insert(accountingRoles).values({
    companyId,
    code: `custom_${Date.now()}`,
    name: input.name,
    isSystem: false,
  });
  const roleId = Number(result[0].insertId);
  if (permissions.length)
    await tx
      .insert(accountingRolePermissions)
      .values(
        permissions.map(permission => ({ roleId, permission, isAllowed: true }))
      );
  await tx.insert(accountingAuditEvents).values({
    entityType: "role",
    entityId: roleId,
    action: "customRoleCreated",
    afterJson: JSON.stringify({ name: input.name, permissions }),
    performedBy: input.userId,
  });
  return { id: roleId };
}

export async function createCustomAccountingRole(input: {
  userId: number;
  isOwner: boolean;
  name: string;
  permissions: string[];
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(tx =>
    createCustomAccountingRoleInTransaction(tx as never, company.id, input)
  );
}

export async function updateAccountingRolePermissionsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  input: {
    userId: number;
    isOwner: boolean;
    roleId: number;
    permissions: string[];
  }
) {
  const [role] = await tx
    .select()
    .from(accountingRoles)
    .where(
      and(
        eq(accountingRoles.id, input.roleId),
        eq(accountingRoles.companyId, companyId)
      )
    )
    .limit(1);
  if (!role) throw new Error("الدور المحاسبي غير صالح");
  const permissions = Array.from(new Set(input.permissions));
  if (
    !input.isOwner &&
    permissions.some(
      permission => permission === "*" || permission === "permissions.manage"
    )
  )
    throw new Error("لا يمكن للمدير المفوض منح صلاحيات المالك");
  const before = await tx
    .select({ permission: accountingRolePermissions.permission })
    .from(accountingRolePermissions)
    .where(eq(accountingRolePermissions.roleId, input.roleId));
  await tx
    .delete(accountingRolePermissions)
    .where(eq(accountingRolePermissions.roleId, input.roleId));
  if (permissions.length)
    await tx.insert(accountingRolePermissions).values(
      permissions.map(permission => ({
        roleId: input.roleId,
        permission,
        isAllowed: true,
      }))
    );
  await tx.insert(accountingAuditEvents).values({
    entityType: "role",
    entityId: input.roleId,
    action: "permissionsUpdated",
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(permissions),
    performedBy: input.userId,
  });
  return { success: true };
}

export async function updateAccountingRolePermissions(input: {
  userId: number;
  isOwner: boolean;
  roleId: number;
  permissions: string[];
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(tx =>
    updateAccountingRolePermissionsInTransaction(tx as never, company.id, input)
  );
}

export async function updateCustomAccountingRole(input: {
  userId: number;
  isOwner: boolean;
  roleId: number;
  name: string;
  permissions: string[];
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(async tx => {
    const [role] = await tx
      .select()
      .from(accountingRoles)
      .where(
        and(
          eq(accountingRoles.id, input.roleId),
          eq(accountingRoles.companyId, company.id)
        )
      )
      .limit(1);
    if (!role) throw new Error("الدور المحاسبي غير صالح");
    const name = input.name.trim();
    if (name.length < 2) throw new Error("اسم الدور قصير جداً");
    const permissions = Array.from(new Set(input.permissions));
    if (
      !input.isOwner &&
      permissions.some(
        permission => permission === "*" || permission === "permissions.manage"
      )
    )
      throw new Error("لا يمكن للمدير المفوض منح صلاحيات المالك");
    const before = await tx
      .select({ name: accountingRoles.name })
      .from(accountingRoles)
      .where(eq(accountingRoles.id, input.roleId));
    await tx
      .update(accountingRoles)
      .set({ name })
      .where(eq(accountingRoles.id, input.roleId));
    await tx
      .delete(accountingRolePermissions)
      .where(eq(accountingRolePermissions.roleId, input.roleId));
    if (permissions.length)
      await tx.insert(accountingRolePermissions).values(
        permissions.map(permission => ({
          roleId: input.roleId,
          permission,
          isAllowed: true,
        }))
      );
    await tx.insert(accountingAuditEvents).values({
      entityType: "role",
      entityId: input.roleId,
      action: "customRoleUpdated",
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify({ name, permissions }),
      performedBy: input.userId,
    });
    return { success: true };
  });
}

export async function deleteCustomAccountingRole(input: {
  userId: number;
  roleId: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  return db.transaction(async tx => {
    const [role] = await tx
      .select()
      .from(accountingRoles)
      .where(
        and(
          eq(accountingRoles.id, input.roleId),
          eq(accountingRoles.companyId, company.id)
        )
      )
      .limit(1);
    if (!role) throw new Error("الدور المحاسبي غير صالح");
    const assigned = await tx
      .select({ id: accountingUserRoles.id })
      .from(accountingUserRoles)
      .where(eq(accountingUserRoles.roleId, input.roleId))
      .limit(1);
    if (assigned[0])
      throw new Error(
        "لا يمكن حذف دور مستخدم حالياً؛ انقل المستخدمين إلى دور آخر أولاً"
      );
    if (role.code === "system_admin") {
      const remaining = await tx
        .select({ id: accountingRoles.id })
        .from(accountingRoles)
        .where(
          and(
            eq(accountingRoles.companyId, company.id),
            eq(accountingRoles.code, "system_admin")
          )
        )
        .limit(2);
      if (remaining.length <= 1)
        throw new Error(
          "لا يمكن حذف آخر دور مدير نظام؛ أنشئ مدير نظام بديلاً أولاً"
        );
    }
    await tx
      .delete(accountingRolePermissions)
      .where(eq(accountingRolePermissions.roleId, input.roleId));
    await tx
      .delete(accountingRoles)
      .where(eq(accountingRoles.id, input.roleId));
    await tx.insert(accountingAuditEvents).values({
      entityType: "role",
      entityId: input.roleId,
      action: "customRoleDeleted",
      beforeJson: JSON.stringify({ code: role.code, name: role.name }),
      performedBy: input.userId,
    });
    return { success: true };
  });
}

export async function getFinancialReportsInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  company: Awaited<ReturnType<typeof setupContext>>["company"],
  filters: { startDate?: Date; endDate?: Date; costCenterId?: number } = {}
) {
  const journalDateFilters = [
    ...(filters.startDate
      ? [gte(accountingJournalEntries.entryDate, filters.startDate)]
      : []),
    ...(filters.endDate
      ? [lte(accountingJournalEntries.entryDate, filters.endDate)]
      : []),
  ];
  const journalCostCenterFilter = filters.costCenterId
    ? [eq(accountingJournalLines.costCenterId, filters.costCenterId)]
    : [];
  const trialBalance = await tx
    .select({
      code: accountingAccounts.code,
      name: accountingAccounts.name,
      type: accountingAccounts.type,
      debitMinor: sql<number>`coalesce(sum(case when ${accountingJournalEntries.status} = 'posted' then ${accountingJournalLines.baseDebitMinor} else 0 end), 0)`,
      creditMinor: sql<number>`coalesce(sum(case when ${accountingJournalEntries.status} = 'posted' then ${accountingJournalLines.baseCreditMinor} else 0 end), 0)`,
    })
    .from(accountingAccounts)
    .leftJoin(
      accountingJournalLines,
      eq(accountingAccounts.id, accountingJournalLines.accountId)
    )
    .leftJoin(
      accountingJournalEntries,
      and(
        eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id),
        eq(accountingJournalEntries.status, "posted"),
        ...journalDateFilters,
        ...journalCostCenterFilter
      )
    )
    .where(eq(accountingAccounts.companyId, company.id))
    .groupBy(
      accountingAccounts.id,
      accountingAccounts.code,
      accountingAccounts.name,
      accountingAccounts.type
    )
    .orderBy(asc(accountingAccounts.code));
  const statements = calculateFinancialStatements(
    trialBalance.map(row => ({
      type: row.type,
      debitMinor: Number(row.debitMinor),
      creditMinor: Number(row.creditMinor),
    }))
  );
  const generalLedger = await tx
    .select({
      entryNumber: accountingJournalEntries.entryNumber,
      entryDate: accountingJournalEntries.entryDate,
      createdAt: accountingJournalEntries.createdAt,
      memo: accountingJournalEntries.memo,
      accountCode: accountingAccounts.code,
      accountName: accountingAccounts.name,
      currencyCode: accountingJournalLines.currencyCode,
      exchangeRatePpm: accountingJournalLines.exchangeRatePpm,
      originalDebitMinor: accountingJournalLines.debitMinor,
      originalCreditMinor: accountingJournalLines.creditMinor,
      debitMinor: accountingJournalLines.baseDebitMinor,
      creditMinor: accountingJournalLines.baseCreditMinor,
    })
    .from(accountingJournalLines)
    .innerJoin(
      accountingJournalEntries,
      eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)
    )
    .innerJoin(
      accountingAccounts,
      eq(accountingJournalLines.accountId, accountingAccounts.id)
    )
    .where(
      and(
        eq(accountingJournalEntries.companyId, company.id),
        eq(accountingJournalEntries.status, "posted"),
        ...journalDateFilters,
        ...journalCostCenterFilter
      )
    )
    .orderBy(
      desc(accountingJournalEntries.entryDate),
      asc(accountingJournalEntries.entryNumber)
    )
    .limit(200);
  const cashRows = await tx
    .select({
      sourceType: accountingJournalEntries.sourceType,
      debitMinor: accountingJournalLines.baseDebitMinor,
      creditMinor: accountingJournalLines.baseCreditMinor,
    })
    .from(accountingJournalLines)
    .innerJoin(
      accountingJournalEntries,
      eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)
    )
    .innerJoin(
      accountingAccounts,
      eq(accountingJournalLines.accountId, accountingAccounts.id)
    )
    .where(
      and(
        eq(accountingJournalEntries.companyId, company.id),
        eq(accountingJournalEntries.status, "posted"),
        ...journalDateFilters,
        ...journalCostCenterFilter,
        inArray(accountingAccounts.code, ["1110", "1210"])
      )
    );
  const cashFlow = cashRows.reduce(
    (flow, row) => {
      const change = Number(row.debitMinor) - Number(row.creditMinor);
      flow.netChange += change;
      if (["fixedAsset", "assetDepreciation"].includes(row.sourceType))
        flow.investing += change;
      else if (["capital", "openingBalance"].includes(row.sourceType))
        flow.financing += change;
      else flow.operating += change;
      return flow;
    },
    { operating: 0, investing: 0, financing: 0, netChange: 0 }
  );
  const invoiceRows = await tx
    .select({
      id: accountingDocuments.id,
      partnerId: businessPartners.id,
      partnerName: businessPartners.name,
      type: accountingDocuments.type,
      totalMinor: accountingDocuments.totalMinor,
      exchangeRatePpm: accountingDocuments.exchangeRatePpm,
      dueAt: accountingDocuments.dueAt,
    })
    .from(accountingDocuments)
    .innerJoin(
      businessPartners,
      eq(accountingDocuments.partnerId, businessPartners.id)
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.status, "posted"),
        ...(filters.startDate
          ? [gte(accountingDocuments.createdAt, filters.startDate)]
          : []),
        ...(filters.endDate
          ? [lte(accountingDocuments.createdAt, filters.endDate)]
          : []),
        inArray(accountingDocuments.type, ["saleInvoice", "purchaseInvoice"])
      )
    );
  const allocationRows = await tx
    .select({
      targetDocumentId: accountingDocumentSettlements.targetDocumentId,
      totalMinor: sql<number>`coalesce(sum(${accountingDocumentSettlements.amountMinor}), 0)`,
    })
    .from(accountingDocumentSettlements)
    .innerJoin(
      accountingDocuments,
      eq(
        accountingDocumentSettlements.settlementDocumentId,
        accountingDocuments.id
      )
    )
    .where(
      and(
        eq(accountingDocuments.companyId, company.id),
        eq(accountingDocuments.status, "posted")
      )
    )
    .groupBy(accountingDocumentSettlements.targetDocumentId);
  const allocatedByInvoice = new Map(
    allocationRows.map(row => [row.targetDocumentId, Number(row.totalMinor)])
  );
  const agingByPartner = new Map<
    string,
    {
      partnerName: string;
      type: string;
      totalMinor: number;
      currentMinor: number;
      days1To30Minor: number;
      days31To60Minor: number;
      days61To90Minor: number;
      daysOver90Minor: number;
    }
  >();
  for (const invoice of invoiceRows) {
    const unsettledMinor = Math.max(
      0,
      Number(invoice.totalMinor) - (allocatedByInvoice.get(invoice.id) ?? 0)
    );
    if (!unsettledMinor) continue;
    const key = `${invoice.partnerId}:${invoice.type}`;
    const current = agingByPartner.get(key) ?? {
      partnerName: invoice.partnerName,
      type: invoice.type,
      totalMinor: 0,
      currentMinor: 0,
      days1To30Minor: 0,
      days31To60Minor: 0,
      days61To90Minor: 0,
      daysOver90Minor: 0,
    };
    const baseUnsettledMinor = Math.round(
      (unsettledMinor * Number(invoice.exchangeRatePpm)) / 1_000_000
    );
    const daysPastDue = invoice.dueAt
      ? Math.max(
          0,
          Math.floor((Date.now() - invoice.dueAt.getTime()) / 86_400_000)
        )
      : 0;
    current.totalMinor += baseUnsettledMinor;
    if (daysPastDue === 0) current.currentMinor += baseUnsettledMinor;
    else if (daysPastDue <= 30) current.days1To30Minor += baseUnsettledMinor;
    else if (daysPastDue <= 60) current.days31To60Minor += baseUnsettledMinor;
    else if (daysPastDue <= 90) current.days61To90Minor += baseUnsettledMinor;
    else current.daysOver90Minor += baseUnsettledMinor;
    agingByPartner.set(key, current);
  }
  const aging = Array.from(agingByPartner.values()).sort(
    (left, right) => right.totalMinor - left.totalMinor
  );
  const totalDebits = trialBalance.reduce(
    (total, row) => total + Number(row.debitMinor),
    0
  );
  const totalCredits = trialBalance.reduce(
    (total, row) => total + Number(row.creditMinor),
    0
  );
  const balanceByCode = new Map(
    trialBalance.map(row => [
      row.code,
      { debit: Number(row.debitMinor), credit: Number(row.creditMinor) },
    ])
  );
  const asset = (code: string) => {
    const row = balanceByCode.get(code);
    return (row?.debit ?? 0) - (row?.credit ?? 0);
  };
  const liabilityOrRevenue = (code: string) => {
    const row = balanceByCode.get(code);
    return (row?.credit ?? 0) - (row?.debit ?? 0);
  };
  const expense = (code: string) => {
    const row = balanceByCode.get(code);
    return (row?.debit ?? 0) - (row?.credit ?? 0);
  };
  const revenue = liabilityOrRevenue("4100");
  const costOfSales = expense("5100");
  const payrollExpense = expense("6200");
  const operatingExpenses = expense("6100");
  const grossProfit = revenue - costOfSales;
  const operatingProfit = grossProfit - payrollExpense - operatingExpenses;
  const currentAssets =
    asset("1110") + asset("1120") + asset("1130") + asset("1210");
  const currentLiabilities =
    liabilityOrRevenue("2110") + liabilityOrRevenue("2210");
  const liquidity = {
    currentAssets,
    currentLiabilities,
    netWorkingCapital: currentAssets - currentLiabilities,
    currentRatioBps:
      currentLiabilities > 0
        ? Math.round((currentAssets * 10_000) / currentLiabilities)
        : null,
  };
  const performance = {
    revenue,
    costOfSales,
    grossProfit,
    payrollExpense,
    operatingExpenses,
    operatingProfit,
    grossMarginBps:
      revenue > 0 ? Math.round((grossProfit * 10_000) / revenue) : null,
    operatingMarginBps:
      revenue > 0 ? Math.round((operatingProfit * 10_000) / revenue) : null,
  };
  return {
    baseCurrencyCode: company.baseCurrencyCode,
    trialBalance,
    incomeStatement: statements.incomeStatement,
    balanceSheet: statements.balanceSheet,
    performance,
    liquidity,
    cashFlow,
    generalLedger,
    aging,
    totals: {
      totalDebits,
      totalCredits,
      balanced: totalDebits === totalCredits,
    },
  };
}

export async function getFinancialReports(input: {
  userId: number;
  startDate?: string;
  endDate?: string;
  costCenterId?: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const startDate = input.startDate
    ? new Date(`${input.startDate}T00:00:00.000Z`)
    : undefined;
  const endDate = input.endDate
    ? new Date(`${input.endDate}T23:59:59.999Z`)
    : undefined;
  if (startDate && endDate && startDate > endDate)
    throw new Error("بداية التقرير يجب أن تسبق نهايته");
  return getFinancialReportsInTransaction(db, company, {
    startDate,
    endDate,
    costCenterId: input.costCenterId,
  });
}

export async function getBudgetComparison(userId: number) {
  const db = await dbOrThrow();
  const { company, period } = await setupContext(userId);
  const accounts = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.companyId, company.id),
        inArray(accountingAccounts.type, ["revenue", "expense"])
      )
    )
    .orderBy(asc(accountingAccounts.code));
  const budgets = await db
    .select()
    .from(accountingBudgets)
    .where(
      and(
        eq(accountingBudgets.companyId, company.id),
        eq(accountingBudgets.fiscalPeriodId, period.id)
      )
    );
  const accountIds = accounts.map(account => account.id);
  const actuals = accountIds.length
    ? await db
        .select({
          accountId: accountingJournalLines.accountId,
          debitMinor: sql<number>`coalesce(sum(${accountingJournalLines.baseDebitMinor}), 0)`,
          creditMinor: sql<number>`coalesce(sum(${accountingJournalLines.baseCreditMinor}), 0)`,
        })
        .from(accountingJournalLines)
        .innerJoin(
          accountingJournalEntries,
          eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)
        )
        .where(
          and(
            eq(accountingJournalEntries.companyId, company.id),
            eq(accountingJournalEntries.fiscalPeriodId, period.id),
            eq(accountingJournalEntries.status, "posted"),
            inArray(accountingJournalLines.accountId, accountIds)
          )
        )
        .groupBy(accountingJournalLines.accountId)
    : [];
  const budgetByAccount = new Map(
    budgets.map(row => [row.accountId, Number(row.budgetMinor)])
  );
  const actualByAccount = new Map(
    actuals.map(row => [
      row.accountId,
      { debit: Number(row.debitMinor), credit: Number(row.creditMinor) },
    ])
  );
  const rows = accounts.map(account => {
    const actual = actualByAccount.get(account.id) ?? { debit: 0, credit: 0 };
    const actualMinor =
      account.type === "revenue"
        ? actual.credit - actual.debit
        : actual.debit - actual.credit;
    const budgetMinor = budgetByAccount.get(account.id) ?? 0;
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      budgetMinor,
      actualMinor,
      varianceMinor: actualMinor - budgetMinor,
    };
  });
  return { fiscalPeriodId: period.id, fiscalPeriodName: period.name, rows };
}

export async function upsertAccountingBudget(input: {
  userId: number;
  accountId: number;
  budgetMinor: number;
}) {
  if (!Number.isInteger(input.budgetMinor) || input.budgetMinor < 0)
    throw new Error("مبلغ الموازنة يجب أن يكون عدداً صحيحاً غير سالب");
  const db = await dbOrThrow();
  const { company, period } = await setupContext(input.userId);
  const account = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.id, input.accountId),
        eq(accountingAccounts.companyId, company.id),
        inArray(accountingAccounts.type, ["revenue", "expense"])
      )
    )
    .limit(1);
  if (!account[0])
    throw new Error("يمكن تخطيط الموازنة لحساب إيراد أو مصروف تابع للشركة فقط");
  await db
    .insert(accountingBudgets)
    .values({
      companyId: company.id,
      fiscalPeriodId: period.id,
      accountId: input.accountId,
      budgetMinor: input.budgetMinor,
      createdBy: input.userId,
    })
    .onDuplicateKeyUpdate({
      set: {
        budgetMinor: input.budgetMinor,
        createdBy: input.userId,
        updatedAt: new Date(),
      },
    });
  await db.insert(accountingAuditEvents).values({
    entityType: "budget",
    entityId: input.accountId,
    action: "upserted",
    afterJson: JSON.stringify({
      fiscalPeriodId: period.id,
      budgetMinor: input.budgetMinor,
    }),
    performedBy: input.userId,
  });
  return { accountId: input.accountId, budgetMinor: input.budgetMinor };
}

export async function createPaymentAccount(input: {
  userId: number;
  name: string;
  type: "cash" | "bank" | "cheque";
  currencyCode: string;
  isMultiCurrency: boolean;
  branchId?: number;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const code =
    input.type === "cash" ? "1110" : input.type === "cheque" ? "1140" : "1210";
  const account = await db
    .select()
    .from(accountingAccounts)
    .where(
      and(
        eq(accountingAccounts.companyId, company.id),
        eq(accountingAccounts.code, code)
      )
    )
    .limit(1);
  if (!account[0]) throw new Error("لم يتم العثور على حساب الصندوق أو البنك");
  if (input.branchId) {
    const branch = await db
      .select({ id: accountingBranches.id })
      .from(accountingBranches)
      .where(
        and(
          eq(accountingBranches.id, input.branchId),
          eq(accountingBranches.companyId, company.id)
        )
      )
      .limit(1);
    if (!branch[0]) throw new Error("الفرع المحدد غير صالح لحساب الدفع");
  }
  const result = await db.insert(accountingPaymentAccounts).values({
    companyId: company.id,
    branchId: input.branchId ?? null,
    accountId: account[0].id,
    type: input.type,
    name: input.name.trim(),
    currencyCode: input.currencyCode,
    isMultiCurrency: input.isMultiCurrency,
  });
  const id = Number(result[0].insertId);
  await db.insert(accountingAuditEvents).values({
    entityType: "paymentAccount",
    entityId: id,
    action: "created",
    afterJson: JSON.stringify({
      name: input.name.trim(),
      type: input.type,
      currencyCode: input.currencyCode,
      isMultiCurrency: input.isMultiCurrency,
      branchId: input.branchId ?? null,
      isActive: true,
    }),
    performedBy: input.userId,
  });
  return { id, isActive: true };
}

export async function updatePaymentAccount(input: {
  userId: number;
  paymentAccountId: number;
  isActive: boolean;
}) {
  const db = await dbOrThrow();
  const { company } = await setupContext(input.userId);
  const [existing] = await db
    .select()
    .from(accountingPaymentAccounts)
    .where(
      and(
        eq(accountingPaymentAccounts.id, input.paymentAccountId),
        eq(accountingPaymentAccounts.companyId, company.id)
      )
    )
    .limit(1);
  if (!existing) throw new Error("حساب الدفع غير صالح");
  await db
    .update(accountingPaymentAccounts)
    .set({ isActive: input.isActive })
    .where(eq(accountingPaymentAccounts.id, existing.id));
  await db.insert(accountingAuditEvents).values({
    entityType: "paymentAccount",
    entityId: existing.id,
    action: "updated",
    beforeJson: JSON.stringify({ isActive: existing.isActive }),
    afterJson: JSON.stringify({ isActive: input.isActive }),
    performedBy: input.userId,
  });
  return { id: existing.id, isActive: input.isActive };
}

export async function recordAttendanceInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: { company: { id: number } },
  input: {
    userId: number;
    employeeId: number;
    workDate: Date;
    status: "present" | "absent" | "leave" | "holiday";
    overtimeMinutes: number;
    note?: string;
  }
) {
  const employee = await tx
    .select()
    .from(accountingEmployees)
    .where(
      and(
        eq(accountingEmployees.id, input.employeeId),
        eq(accountingEmployees.companyId, context.company.id)
      )
    )
    .limit(1);
  if (!employee[0]) throw new Error("الموظف غير صالح");
  const result = await tx.insert(accountingAttendance).values({
    employeeId: input.employeeId,
    workDate: input.workDate,
    status: input.status,
    overtimeMinutes: input.overtimeMinutes,
    note: input.note ?? null,
    approvalStatus: "draft",
    createdBy: input.userId,
  });
  const id = Number(result[0].insertId);
  await tx.insert(accountingAuditEvents).values({
    entityType: "attendance",
    entityId: id,
    action: "created",
    afterJson: JSON.stringify({
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: input.status,
      overtimeMinutes: input.overtimeMinutes,
    }),
    performedBy: input.userId,
  });
  return { id, approvalStatus: "draft" as const };
}

export async function recordAttendance(input: {
  userId: number;
  employeeId: number;
  workDate: Date;
  status: "present" | "absent" | "leave" | "holiday";
  overtimeMinutes: number;
  note?: string;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    recordAttendanceInTransaction(
      tx as never,
      { company: context.company },
      input
    )
  );
}

export async function listAttendanceForReview(userId: number) {
  const db = await dbOrThrow();
  const { company } = await setupContext(userId);
  return db
    .select({
      id: accountingAttendance.id,
      employeeId: accountingAttendance.employeeId,
      employeeName: accountingEmployees.fullName,
      workDate: accountingAttendance.workDate,
      status: accountingAttendance.status,
      overtimeMinutes: accountingAttendance.overtimeMinutes,
      approvalStatus: accountingAttendance.approvalStatus,
      createdBy: accountingAttendance.createdBy,
      submittedBy: accountingAttendance.submittedBy,
      submittedAt: accountingAttendance.submittedAt,
      approvedBy: accountingAttendance.approvedBy,
      approvedAt: accountingAttendance.approvedAt,
    })
    .from(accountingAttendance)
    .innerJoin(
      accountingEmployees,
      eq(accountingAttendance.employeeId, accountingEmployees.id)
    )
    .where(eq(accountingEmployees.companyId, company.id))
    .orderBy(desc(accountingAttendance.workDate), desc(accountingAttendance.id))
    .limit(200);
}

async function findAttendanceForReview(
  db: Awaited<ReturnType<typeof dbOrThrow>>,
  companyId: number,
  attendanceId: number
) {
  const rows = await db
    .select({
      id: accountingAttendance.id,
      approvalStatus: accountingAttendance.approvalStatus,
      createdBy: accountingAttendance.createdBy,
      submittedBy: accountingAttendance.submittedBy,
    })
    .from(accountingAttendance)
    .innerJoin(
      accountingEmployees,
      eq(accountingAttendance.employeeId, accountingEmployees.id)
    )
    .where(
      and(
        eq(accountingAttendance.id, attendanceId),
        eq(accountingEmployees.companyId, companyId)
      )
    )
    .limit(1);
  if (!rows[0]) throw new Error("سجل الحضور غير موجود ضمن الشركة الحالية");
  return rows[0];
}

export async function submitAttendanceForApprovalInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: { company: { id: number } },
  input: { userId: number; attendanceId: number }
) {
  const attendance = await findAttendanceForReview(
    tx,
    context.company.id,
    input.attendanceId
  );
  if (attendance.approvalStatus !== "draft")
    throw new Error("سجل الحضور غير جاهز للإرسال للمراجعة");
  if (attendance.createdBy !== null && attendance.createdBy !== input.userId)
    throw new Error("لا يمكن إرسال سجل حضور أنشأه مستخدم آخر");
  await tx
    .update(accountingAttendance)
    .set({
      approvalStatus: "pendingApproval",
      submittedBy: input.userId,
      submittedAt: new Date(),
    })
    .where(eq(accountingAttendance.id, attendance.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "attendance",
    entityId: attendance.id,
    action: "submitted",
    performedBy: input.userId,
  });
  return { approvalStatus: "pendingApproval" as const };
}

export async function submitAttendanceForApproval(input: {
  userId: number;
  attendanceId: number;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    submitAttendanceForApprovalInTransaction(
      tx as never,
      { company: context.company },
      input
    )
  );
}

export async function approveAttendanceInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: { company: { id: number } },
  input: { userId: number; attendanceId: number }
) {
  const attendance = await findAttendanceForReview(
    tx,
    context.company.id,
    input.attendanceId
  );
  if (attendance.approvalStatus !== "pendingApproval")
    throw new Error("سجل الحضور غير جاهز للاعتماد");
  if (
    attendance.createdBy === input.userId ||
    attendance.submittedBy === input.userId
  )
    throw new Error("لا يمكن اعتماد سجل الحضور الذي أنشأته أو أرسلته بنفسك");
  await tx
    .update(accountingAttendance)
    .set({
      approvalStatus: "approved",
      approvedBy: input.userId,
      approvedAt: new Date(),
    })
    .where(eq(accountingAttendance.id, attendance.id));
  await tx.insert(accountingAuditEvents).values({
    entityType: "attendance",
    entityId: attendance.id,
    action: "approved",
    performedBy: input.userId,
  });
  return { approvalStatus: "approved" as const };
}

export async function approveAttendance(input: {
  userId: number;
  attendanceId: number;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    approveAttendanceInTransaction(
      tx as never,
      { company: context.company },
      input
    )
  );
}

export async function updatePayrollLineInTransaction(
  tx: Awaited<ReturnType<typeof dbOrThrow>>,
  context: { company: { id: number } },
  input: {
    payrollRunId: number;
    employeeId: number;
    advanceMinor: number;
    deductionMinor: number;
  }
) {
  const runs = await tx
    .select()
    .from(accountingPayrollRuns)
    .where(
      and(
        eq(accountingPayrollRuns.id, input.payrollRunId),
        eq(accountingPayrollRuns.companyId, context.company.id),
        eq(accountingPayrollRuns.status, "draft")
      )
    )
    .limit(1);
  if (!runs[0]) throw new Error("مسير الرواتب غير متاح للتعديل");
  const lines = await tx
    .select()
    .from(accountingPayrollLines)
    .where(
      and(
        eq(accountingPayrollLines.payrollRunId, input.payrollRunId),
        eq(accountingPayrollLines.employeeId, input.employeeId)
      )
    )
    .limit(1);
  const line = lines[0];
  if (!line) throw new Error("سطر الراتب غير موجود");
  const netMinor = line.grossMinor - input.advanceMinor - input.deductionMinor;
  if (netMinor < 0)
    throw new Error("السلف والاستقطاعات لا يمكن أن تتجاوز الراتب الإجمالي");
  await tx
    .update(accountingPayrollLines)
    .set({
      advanceMinor: input.advanceMinor,
      deductionMinor: input.deductionMinor,
      netMinor,
    })
    .where(eq(accountingPayrollLines.id, line.id));
  return { grossMinor: line.grossMinor, netMinor };
}

export async function updatePayrollLine(input: {
  userId: number;
  payrollRunId: number;
  employeeId: number;
  advanceMinor: number;
  deductionMinor: number;
}) {
  const db = await dbOrThrow();
  const context = await setupContext(input.userId);
  return db.transaction(tx =>
    updatePayrollLineInTransaction(
      tx as never,
      { company: context.company },
      input
    )
  );
}

export async function closeCurrentFiscalPeriod(userId: number) {
  const db = await dbOrThrow();
  const context = await setupContext(userId);
  return db.transaction(async tx => {
    const readiness = await getFiscalCloseReadinessInTransaction(
      tx as never,
      context.period.id
    );
    if (!readiness.canClose)
      throw new Error(
        `لا يمكن إقفال الفترة: ${readiness.unpostedDocuments} مستند غير مرحل، ${readiness.unpostedPayrollRuns} مسير غير مرحل، ${readiness.unpostedJournalEntries} قيد غير مرحل، ${readiness.unbalancedJournalEntries} قيد غير متوازن`
      );
    const existingNext = await tx
      .select({ id: accountingFiscalPeriods.id })
      .from(accountingFiscalPeriods)
      .where(
        and(
          eq(accountingFiscalPeriods.companyId, context.company.id),
          eq(
            accountingFiscalPeriods.startsOn,
            new Date(context.period.endsOn.getTime() + 1)
          )
        )
      )
      .limit(1);
    if (existingNext[0])
      throw new Error("السنة التالية مفتوحة أو أُنشئت مسبقاً لهذه الفترة");

    const nextStartsOn = new Date(
      Date.UTC(context.period.endsOn.getUTCFullYear() + 1, 0, 1)
    );
    const nextEndsOn = new Date(
      Date.UTC(nextStartsOn.getUTCFullYear() + 1, 0, 0, 23, 59, 59)
    );
    const nextPeriodResult = await tx.insert(accountingFiscalPeriods).values({
      companyId: context.company.id,
      name: `السنة المالية ${nextStartsOn.getUTCFullYear()}`,
      startsOn: nextStartsOn,
      endsOn: nextEndsOn,
      status: "open",
    });
    const nextPeriodId = Number(nextPeriodResult[0].insertId);

    const rows = await tx
      .select({
        accountId: accountingAccounts.id,
        accountType: accountingAccounts.type,
        debit: accountingJournalLines.baseDebitMinor,
        credit: accountingJournalLines.baseCreditMinor,
      })
      .from(accountingJournalLines)
      .innerJoin(
        accountingJournalEntries,
        eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)
      )
      .innerJoin(
        accountingAccounts,
        eq(accountingJournalLines.accountId, accountingAccounts.id)
      )
      .where(
        and(
          eq(accountingJournalEntries.fiscalPeriodId, context.period.id),
          eq(accountingJournalEntries.status, "posted")
        )
      );
    const balances = new Map<
      number,
      { type: string; debit: number; credit: number }
    >();
    for (const row of rows) {
      if (row.accountType === "revenue" || row.accountType === "expense")
        continue;
      const current = balances.get(row.accountId) ?? {
        type: row.accountType,
        debit: 0,
        credit: 0,
      };
      current.debit += Number(row.debit);
      current.credit += Number(row.credit);
      balances.set(row.accountId, current);
    }
    const retained = await tx
      .select({ id: accountingAccounts.id })
      .from(accountingAccounts)
      .where(
        and(
          eq(accountingAccounts.companyId, context.company.id),
          eq(accountingAccounts.code, "3200")
        )
      )
      .limit(1);
    let retainedEarningsId = retained[0]?.id;
    if (!retainedEarningsId) {
      const created = await tx.insert(accountingAccounts).values({
        companyId: context.company.id,
        code: "3200",
        name: "الأرباح المحتجزة",
        type: "equity",
        normalBalance: "credit",
      });
      retainedEarningsId = Number(created[0].insertId);
    }
    const lines = Array.from(balances.entries()).map(([accountId, value]) => ({
      accountId,
      debitMinor: Math.max(value.debit - value.credit, 0),
      creditMinor: Math.max(value.credit - value.debit, 0),
    }));
    const netIncome = rows.reduce(
      (total, row) =>
        total +
        (row.accountType === "revenue"
          ? Number(row.credit) - Number(row.debit)
          : row.accountType === "expense"
            ? Number(row.debit) - Number(row.credit)
            : 0),
      0
    );
    if (netIncome !== 0)
      lines.push({
        accountId: retainedEarningsId,
        debitMinor: Math.max(-netIncome, 0),
        creditMinor: Math.max(netIncome, 0),
      });
    const totalDebit = lines.reduce(
      (total, line) => total + line.debitMinor,
      0
    );
    const totalCredit = lines.reduce(
      (total, line) => total + line.creditMinor,
      0
    );
    if (totalDebit !== totalCredit)
      throw new Error("تعذر إنشاء قيد الأرصدة الافتتاحية المتوازن");
    let openingEntryId: number | null = null;
    if (lines.length > 0) {
      const entry = await tx.insert(accountingJournalEntries).values({
        companyId: context.company.id,
        branchId: context.branch.id,
        fiscalPeriodId: nextPeriodId,
        entryNumber: `OPEN-${nextStartsOn.getUTCFullYear()}`,
        entryDate: nextStartsOn,
        sourceType: "openingBalance",
        status: "posted",
        memo: `قيد افتتاحي للسنة المالية ${nextStartsOn.getUTCFullYear()}`,
        createdBy: userId,
        postedBy: userId,
        postedAt: new Date(),
      });
      openingEntryId = Number(entry[0].insertId);
      await tx.insert(accountingJournalLines).values(
        lines.map(line => ({
          journalEntryId: openingEntryId!,
          accountId: line.accountId,
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          debitMinor: line.debitMinor,
          creditMinor: line.creditMinor,
          baseDebitMinor: line.debitMinor,
          baseCreditMinor: line.creditMinor,
        }))
      );
    }
    await tx
      .update(accountingFiscalPeriods)
      .set({ status: "closed" })
      .where(eq(accountingFiscalPeriods.id, context.period.id));
    await tx.insert(accountingAuditEvents).values({
      entityType: "fiscalPeriod",
      entityId: context.period.id,
      action: "closedAndOpenedNext",
      afterJson: JSON.stringify({ nextPeriodId, openingEntryId }),
      performedBy: userId,
    });
    return {
      id: context.period.id,
      status: "closed" as const,
      nextPeriodId,
      openingEntryId,
    };
  });
}
