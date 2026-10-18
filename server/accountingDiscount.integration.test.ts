import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import {
  accountingApprovals,
  accountingBranches,
  accountingCompanies,
  accountingDocuments,
  accountingFiscalPeriods,
  accountingPriceLists,
  users,
} from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("discount override database integration", () => {
  it("routes a price-list discount override to approval with a documented reason before posting", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار اعتماد الخصم");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !approver) throw new Error("بيانات تهيئة اعتماد الخصم غير مكتملة");

    const rollback = new Error("intentional discount-override test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `discount-test-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار الخصم", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const created = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, {
          userId: creatorId,
          type: "saleInvoice",
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          note: "اختبار تجاوز حد الخصم",
          lines: [{ description: "بند خصم تجريبي", quantity: 1, unitPriceMinor: 10_000, discountMinor: 1_000 }],
        });
        expect(created.status).toBe("pendingApproval");
        const [pendingApproval] = await tx.select().from(accountingApprovals).where(and(eq(accountingApprovals.entityType, "document"), eq(accountingApprovals.entityId, created.id))).limit(1);
        expect(pendingApproval).toMatchObject({ action: "discountOverride", status: "pending", requestedBy: creatorId });
        expect(pendingApproval?.reason).toContain("خصم 1000");

        const result = await approveAndPostDocumentInTransaction(tx as never, { company, branch, period }, created.id, approver.id);
        expect(result.status).toBe("posted");
        const [postedDocument] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, created.id)).limit(1);
        const [approvedDiscount] = await tx.select().from(accountingApprovals).where(eq(accountingApprovals.id, pendingApproval!.id)).limit(1);
        expect(postedDocument?.status).toBe("posted");
        expect(approvedDiscount?.status).toBe("approved");
        expect(approvedDiscount?.decidedBy).toBe(approver.id);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });

  it("uses the selected active price list instead of the default threshold", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار قائمة الأسعار المختارة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات سياق قائمة الأسعار غير مكتملة");
    const rollback = new Error("intentional selected-price-list test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = Date.now();
        const creatorResult = await tx.insert(users).values({ openId: `price-list-${suffix}`, name: "منشئ قائمة أسعار", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const strictResult = await tx.insert(accountingPriceLists).values({ companyId: company.id, code: `STRICT-${suffix}`, name: "حد صارم", currencyCode: "USD", maxDiscountBps: 100, isActive: true });
        const flexibleResult = await tx.insert(accountingPriceLists).values({ companyId: company.id, code: `FLEX-${suffix}`, name: "حد مرن", currencyCode: "USD", maxDiscountBps: 1_000, isActive: true });
        const inactiveResult = await tx.insert(accountingPriceLists).values({ companyId: company.id, code: `OFF-${suffix}`, name: "موقوف", currencyCode: "USD", maxDiscountBps: 10_000, isActive: false });
        const strictId = Number(strictResult[0].insertId);
        const flexibleId = Number(flexibleResult[0].insertId);
        const inactiveId = Number(inactiveResult[0].insertId);
        const context = { company, branch, period };
        await expect(createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", priceListId: inactiveId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "قائمة موقوفة", quantity: 1, unitPriceMinor: 10_000, discountMinor: 500 }] })).rejects.toThrow("قائمة الأسعار غير فعالة");
        const strictDocument = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", priceListId: strictId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "تجاوز حد صارم", quantity: 1, unitPriceMinor: 10_000, discountMinor: 500 }] });
        const flexibleDocument = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", priceListId: flexibleId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "ضمن حد مرن", quantity: 1, unitPriceMinor: 10_000, discountMinor: 500 }] });
        const stored = await tx.select().from(accountingDocuments).where(inArray(accountingDocuments.id, [strictDocument.id, flexibleDocument.id]));
        expect(strictDocument.status).toBe("pendingApproval");
        expect(flexibleDocument.status).toBe("draft");
        expect(stored.find(document => document.id === strictDocument.id)?.priceListId).toBe(strictId);
        expect(stored.find(document => document.id === flexibleDocument.id)?.priceListId).toBe(flexibleId);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
