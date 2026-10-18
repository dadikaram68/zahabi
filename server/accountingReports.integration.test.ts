import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountingAccounts,
  accountingBranches,
  accountingCompanies,
  accountingFiscalPeriods,
  accountingJournalEntries,
  accountingJournalLines,
  users,
} from "../drizzle/schema";
import { getFinancialReportsInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("financial report database integration", () => {
  it("includes only posted journals in the ledger, trial balance, and current-period earnings", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار التقارير المالية");

    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [actor] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !actor) throw new Error("بيانات تهيئة التقارير المالية غير مكتملة");

    const rollback = new Error("intentional financial-report test rollback");
    try {
      await database.transaction(async tx => {
        const [cash] = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), eq(accountingAccounts.code, "1110"))).limit(1);
        const [sales] = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), eq(accountingAccounts.code, "4100"))).limit(1);
        if (!cash || !sales) throw new Error("حسابات التقرير المالي غير مكتملة");

        const before = await getFinancialReportsInTransaction(tx as never, company);
        const suffix = Date.now();
        const postedNumber = `REPORT-POSTED-${suffix}`;
        const draftNumber = `REPORT-DRAFT-${suffix}`;
        const entryDate = new Date("2030-12-31T00:00:00.000Z");
        const [postedInsert] = await tx.insert(accountingJournalEntries).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, entryNumber: postedNumber, entryDate, sourceType: "test", status: "posted", createdBy: actor.id, postedBy: actor.id, postedAt: entryDate });
        const [draftInsert] = await tx.insert(accountingJournalEntries).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, entryNumber: draftNumber, entryDate, sourceType: "test", status: "draft", createdBy: actor.id });
        const postedEntryId = Number(postedInsert.insertId);
        const draftEntryId = Number(draftInsert.insertId);
        await tx.insert(accountingJournalLines).values([
          { journalEntryId: postedEntryId, accountId: cash.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, debitMinor: 100, creditMinor: 0, baseDebitMinor: 100, baseCreditMinor: 0 },
          { journalEntryId: postedEntryId, accountId: sales.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, debitMinor: 0, creditMinor: 100, baseDebitMinor: 0, baseCreditMinor: 100 },
          { journalEntryId: draftEntryId, accountId: cash.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, debitMinor: 900, creditMinor: 0, baseDebitMinor: 900, baseCreditMinor: 0 },
          { journalEntryId: draftEntryId, accountId: sales.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, debitMinor: 0, creditMinor: 900, baseDebitMinor: 0, baseCreditMinor: 900 },
        ]);

        const after = await getFinancialReportsInTransaction(tx as never, company);
        const beforeCash = before.trialBalance.find(row => row.code === "1110")!;
        const afterCash = after.trialBalance.find(row => row.code === "1110")!;
        const beforeSales = before.trialBalance.find(row => row.code === "4100")!;
        const afterSales = after.trialBalance.find(row => row.code === "4100")!;
        expect(Number(afterCash.debitMinor) - Number(beforeCash.debitMinor)).toBe(100);
        expect(Number(afterSales.creditMinor) - Number(beforeSales.creditMinor)).toBe(100);
        expect(after.generalLedger.some(row => row.entryNumber === postedNumber)).toBe(true);
        expect(after.generalLedger.some(row => row.entryNumber === draftNumber)).toBe(false);
        expect(after.balanceSheet.assets - before.balanceSheet.assets).toBe(100);
        expect(after.balanceSheet.currentPeriodEarnings - before.balanceSheet.currentPeriodEarnings).toBe(100);
        expect(after.performance.revenue - before.performance.revenue).toBe(100);
        expect(after.performance.grossProfit - before.performance.grossProfit).toBe(100);
        expect(after.liquidity.currentAssets - before.liquidity.currentAssets).toBe(100);
        expect(after.liquidity.netWorkingCapital - before.liquidity.netWorkingCapital).toBe(100);
        expect(after.totals.balanced).toBe(true);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
