import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAccounts, accountingBranches, accountingCheques, accountingCompanies, accountingDocuments, accountingFiscalPeriods, accountingJournalLines, accountingPaymentAccounts, users } from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, settleChequeInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("cheque lifecycle database integration", () => {
  it("creates a pending received cheque and posts it to cheques-under-collection when its receipt is approved", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار إنشاء الشيك");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات تهيئة اختبار إنشاء الشيك غير مكتملة");
    const rollback = new Error("intentional cheque creation rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `chq-post-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ سند الشيك", role: "user" });
        const approverResult = await tx.insert(users).values({ openId: `${suffix}-approver`, name: "معتمد سند الشيك", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const approverId = Number(approverResult[0].insertId);
        const accounts = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), inArray(accountingAccounts.code, ["1140"])));
        const chequeAccountId = accounts[0]!.id;
        const paymentResult = await tx.insert(accountingPaymentAccounts).values({ companyId: company.id, branchId: branch.id, accountId: chequeAccountId, type: "cheque", name: `دفتر ${suffix}`, currencyCode: "USD" });
        const paymentAccountId = Number(paymentResult[0].insertId);
        const document = await createAccountingDocumentInTransaction(tx as never, { company, branch, period } as never, { userId: creatorId, type: "receipt", paymentAccountId, chequeNumber: `R-${suffix}`, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "قبض بشيك", quantity: 1, unitPriceMinor: 1200, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, document.id, creatorId);
        const posted = await approveAndPostDocumentInTransaction(tx as never, { company, branch, period } as never, document.id, approverId);
        const [cheque] = await tx.select().from(accountingCheques).where(eq(accountingCheques.sourceDocumentId, document.id)).limit(1);
        const sourceLines = await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, posted.journalEntryId!));
        expect(cheque).toMatchObject({ direction: "received", status: "pending", chequeNumber: `R-${suffix}`, amountMinor: 1200 });
        expect(sourceLines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: chequeAccountId, debitMinor: 1200, creditMinor: 0 })]));
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });

  it("clears and bounces received cheques with separate balanced postings", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الشيكات");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات تهيئة اختبار الشيكات غير مكتملة");
    const rollback = new Error("intentional cheque test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `chq-${Date.now()}`;
        const userResult = await tx.insert(users).values({ openId: `${suffix}-manager`, name: "مدير اختبار شيك", role: "user" });
        const userId = Number(userResult[0].insertId);
        const accounts = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), inArray(accountingAccounts.code, ["1120", "1140", "1210"])));
        const accountByCode = new Map(accounts.map(account => [account.code, account.id]));
        const chequePaymentResult = await tx.insert(accountingPaymentAccounts).values({ companyId: company.id, branchId: branch.id, accountId: accountByCode.get("1140")!, type: "cheque", name: `دفتر ${suffix}`, currencyCode: "USD" });
        const bankPaymentResult = await tx.insert(accountingPaymentAccounts).values({ companyId: company.id, branchId: branch.id, accountId: accountByCode.get("1210")!, type: "bank", name: `بنك ${suffix}`, currencyCode: "USD" });
        const chequePaymentAccountId = Number(chequePaymentResult[0].insertId);
        const bankPaymentAccountId = Number(bankPaymentResult[0].insertId);
        const createReceivedCheque = async (number: string) => {
          const documentResult = await tx.insert(accountingDocuments).values({ companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `RC-${number}`, type: "receipt", status: "posted", paymentAccountId: chequePaymentAccountId, currencyCode: "USD", exchangeRatePpm: 1_000_000, subtotalMinor: 1200, totalMinor: 1200, chequeNumber: number, createdBy: userId, approvedBy: userId, postedAt: new Date() });
          const sourceDocumentId = Number(documentResult[0].insertId);
          const chequeResult = await tx.insert(accountingCheques).values({ companyId: company.id, branchId: branch.id, sourceDocumentId, paymentAccountId: chequePaymentAccountId, chequeNumber: number, direction: "received", amountMinor: 1200, currencyCode: "USD", exchangeRatePpm: 1_000_000, createdBy: userId });
          return Number(chequeResult[0].insertId);
        };
        const clearedChequeId = await createReceivedCheque(`${suffix}-CLR`);
        const cleared = await settleChequeInTransaction(tx as never, { company, branch, period } as never, { userId, chequeId: clearedChequeId, action: "clear", bankPaymentAccountId });
        expect(cleared.status).toBe("cleared");
        const clearedLines = await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, cleared.journalEntryId));
        expect(clearedLines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: accountByCode.get("1210"), debitMinor: 1200, creditMinor: 0 }), expect.objectContaining({ accountId: accountByCode.get("1140"), debitMinor: 0, creditMinor: 1200 })]));
        const bouncedChequeId = await createReceivedCheque(`${suffix}-BNC`);
        const bounced = await settleChequeInTransaction(tx as never, { company, branch, period } as never, { userId, chequeId: bouncedChequeId, action: "bounce" });
        expect(bounced.status).toBe("bounced");
        const bouncedLines = await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, bounced.journalEntryId));
        expect(bouncedLines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: accountByCode.get("1120"), debitMinor: 1200, creditMinor: 0 }), expect.objectContaining({ accountId: accountByCode.get("1140"), debitMinor: 0, creditMinor: 1200 })]));
        await expect(settleChequeInTransaction(tx as never, { company, branch, period } as never, { userId, chequeId: bouncedChequeId, action: "bounce" })).rejects.toThrow("لا يمكن تسوية إلا شيك معلق");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
