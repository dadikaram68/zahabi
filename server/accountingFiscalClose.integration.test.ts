import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAccounts, accountingBranches, accountingCompanies, accountingDocuments, accountingFiscalPeriods, accountingJournalEntries, accountingJournalLines, accountingPayrollRuns, users } from "../drizzle/schema";
import { getFiscalCloseReadinessInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("fiscal close readiness database integration", () => {
  it("reports unposted documents, payroll, journals, and unbalanced posted entries before closure", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الإقفال المالي");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [account] = company ? await database.select().from(accountingAccounts).where(eq(accountingAccounts.companyId, company.id)).limit(1) : [];
    if (!company || !branch || !period || !account) throw new Error("بيانات الفترة المالية غير مكتملة");
    const rollback = new Error("intentional fiscal-close readiness test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = Date.now();
        const baseline = await getFiscalCloseReadinessInTransaction(tx as never, period.id);
        const userResult = await tx.insert(users).values({ openId: `close-${suffix}`, name: "مراجع إقفال", role: "user" });
        const userId = Number(userResult[0].insertId);
        await tx.insert(accountingDocuments).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `CLOSE-DOC-${suffix}`, type: "saleInvoice", status: "draft", currencyCode: "USD", exchangeRatePpm: 1_000_000, subtotalMinor: 0, discountMinor: 0, totalMinor: 0, createdBy: userId });
        await tx.insert(accountingPayrollRuns).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, name: `مسير-${suffix}`, periodStart: new Date("2026-01-01T00:00:00.000Z"), periodEnd: new Date("2026-01-31T23:59:59.000Z"), createdBy: userId, status: "draft" });
        await tx.insert(accountingJournalEntries).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, entryNumber: `CLOSE-DRAFT-${suffix}`, entryDate: new Date(), sourceType: "manual", status: "draft", createdBy: userId });
        const postedResult = await tx.insert(accountingJournalEntries).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, entryNumber: `CLOSE-POSTED-${suffix}`, entryDate: new Date(), sourceType: "manual", status: "posted", createdBy: userId, postedBy: userId, postedAt: new Date() });
        const postedId = Number(postedResult[0].insertId);
        await tx.insert(accountingJournalLines).values({ journalEntryId: postedId, accountId: account.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, debitMinor: 100, creditMinor: 0, baseDebitMinor: 100, baseCreditMinor: 0 });
        const readiness = await getFiscalCloseReadinessInTransaction(tx as never, period.id);
        expect(readiness).toMatchObject({ unpostedDocuments: baseline.unpostedDocuments + 1, unpostedPayrollRuns: baseline.unpostedPayrollRuns + 1, unpostedJournalEntries: baseline.unpostedJournalEntries + 1, unbalancedJournalEntries: baseline.unbalancedJournalEntries + 1, totalDebitMinor: baseline.totalDebitMinor + 100, totalCreditMinor: baseline.totalCreditMinor, canClose: false });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
