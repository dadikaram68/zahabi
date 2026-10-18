import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountingAccounts,
  accountingBranches,
  accountingCompanies,
  accountingDocuments,
  accountingDocumentSettlements,
  accountingFiscalPeriods,
  accountingPaymentAccounts,
  businessPartners,
  users,
} from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, getFinancialReportsInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("receipt allocation database integration", () => {
  it("allocates a posted receipt to a sales invoice, rejects over-allocation, and reports the unsettled balance", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار تسوية الذمم");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !approver) throw new Error("بيانات تهيئة التسوية غير مكتملة");

    const rollback = new Error("intentional receipt-allocation test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `receipt-allocation-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار التسوية", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const partnerResult = await tx.insert(businessPartners).values({ type: "customer", name: `عميل تسوية ${suffix}`, createdBy: creatorId });
        const partnerId = Number(partnerResult[0].insertId);
        const [cashAccount] = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), eq(accountingAccounts.code, "1110"))).limit(1);
        if (!cashAccount) throw new Error("حساب الصندوق غير موجود");
        const paymentAccountResult = await tx.insert(accountingPaymentAccounts).values({ companyId: company.id, accountId: cashAccount.id, type: "cash", name: `صندوق تسوية ${suffix}`, currencyCode: "USD" });
        const paymentAccountId = Number(paymentAccountResult[0].insertId);
        const context = { company, branch, period };

        const invoice = await createAccountingDocumentInTransaction(tx as never, context, {
          userId: creatorId,
          type: "saleInvoice",
          partnerId,
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          dueAt: new Date(Date.now() - 12 * 86_400_000),
          lines: [{ description: "فاتورة تسوية", quantity: 1, unitPriceMinor: 1_000, discountMinor: 0 }],
        });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, invoice.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, invoice.id, approver.id);

        const receipt = await createAccountingDocumentInTransaction(tx as never, context, {
          userId: creatorId,
          type: "receipt",
          partnerId,
          paymentAccountId,
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          lines: [{ description: "قبض جزئي", quantity: 1, unitPriceMinor: 600, discountMinor: 0 }],
          settlements: [{ targetDocumentId: invoice.id, amountMinor: 600 }],
        });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, receipt.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, receipt.id, approver.id);

        const settlements = await tx.select().from(accountingDocumentSettlements).where(eq(accountingDocumentSettlements.settlementDocumentId, receipt.id));
        expect(settlements).toHaveLength(1);
        expect(settlements[0]).toMatchObject({ targetDocumentId: invoice.id, amountMinor: 600 });
        await expect(createAccountingDocumentInTransaction(tx as never, context, {
          userId: creatorId,
          type: "receipt",
          partnerId,
          paymentAccountId,
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          lines: [{ description: "قبض زائد", quantity: 1, unitPriceMinor: 500, discountMinor: 0 }],
          settlements: [{ targetDocumentId: invoice.id, amountMinor: 500 }],
        })).rejects.toThrow("تخصيص التسوية يتجاوز الرصيد المتبقي للفاتورة");

        const reports = await getFinancialReportsInTransaction(tx as never, company);
        const aging = reports.aging.find(row => row.partnerName === `عميل تسوية ${suffix}` && row.type === "saleInvoice");
        expect(aging?.totalMinor).toBe(400);
        expect(aging?.currentMinor).toBe(0);
        expect(aging?.days1To30Minor).toBe(400);
        expect(aging?.days31To60Minor).toBe(0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });

  it("uses payment allocations for supplier ageing and places unsettled balances in every due-date bucket", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار أعمار الموردين");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !approver) throw new Error("بيانات تهيئة أعمار الموردين غير مكتملة");

    const rollback = new Error("intentional supplier-ageing test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `supplier-ageing-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار المورد", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const partnerName = `مورد تسوية ${suffix}`;
        const partnerResult = await tx.insert(businessPartners).values({ type: "supplier", name: partnerName, createdBy: creatorId });
        const partnerId = Number(partnerResult[0].insertId);
        const [cashAccount] = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), eq(accountingAccounts.code, "1110"))).limit(1);
        if (!cashAccount) throw new Error("حساب الصندوق غير موجود");
        const paymentAccountResult = await tx.insert(accountingPaymentAccounts).values({ companyId: company.id, accountId: cashAccount.id, type: "cash", name: `صندوق مورد ${suffix}`, currencyCode: "USD" });
        const paymentAccountId = Number(paymentAccountResult[0].insertId);
        const context = { company, branch, period };
        const purchase = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseInvoice", partnerId, currencyCode: "USD", exchangeRatePpm: 1_000_000, dueAt: new Date(Date.now() - 45 * 86_400_000), lines: [{ description: "شراء للمورد", quantity: 1, unitPriceMinor: 1_000, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchase.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, purchase.id, approver.id);
        const payment = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "payment", partnerId, paymentAccountId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "صرف جزئي للمورد", quantity: 1, unitPriceMinor: 300, discountMinor: 0 }], settlements: [{ targetDocumentId: purchase.id, amountMinor: 300 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, payment.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, payment.id, approver.id);

        const now = Date.now();
        await tx.insert(accountingDocuments).values([
          { companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `AGE-CURRENT-${suffix}`, type: "purchaseInvoice", status: "posted", partnerId, currencyCode: "USD", exchangeRatePpm: 1_000_000, totalMinor: 10, dueAt: new Date(now + 2 * 86_400_000), createdBy: creatorId, postedAt: new Date() },
          { companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `AGE-31-${suffix}`, type: "purchaseInvoice", status: "posted", partnerId, currencyCode: "USD", exchangeRatePpm: 1_000_000, totalMinor: 20, dueAt: new Date(now - 40 * 86_400_000), createdBy: creatorId, postedAt: new Date() },
          { companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `AGE-61-${suffix}`, type: "purchaseInvoice", status: "posted", partnerId, currencyCode: "USD", exchangeRatePpm: 1_000_000, totalMinor: 30, dueAt: new Date(now - 70 * 86_400_000), createdBy: creatorId, postedAt: new Date() },
          { companyId: company.id, branchId: branch.id, fiscalPeriodId: period.id, documentNumber: `AGE-90-${suffix}`, type: "purchaseInvoice", status: "posted", partnerId, currencyCode: "USD", exchangeRatePpm: 1_000_000, totalMinor: 40, dueAt: new Date(now - 100 * 86_400_000), createdBy: creatorId, postedAt: new Date() },
        ]);
        const reports = await getFinancialReportsInTransaction(tx as never, company);
        const aging = reports.aging.find(row => row.partnerName === partnerName && row.type === "purchaseInvoice");
        expect(aging).toMatchObject({ totalMinor: 800, currentMinor: 10, days1To30Minor: 0, days31To60Minor: 720, days61To90Minor: 30, daysOver90Minor: 40 });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
