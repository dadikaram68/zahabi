import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAuditEvents, accountingBranches, accountingCompanies, accountingDocuments, accountingFiscalPeriods, users } from "../drizzle/schema";
import { cancelAccountingDocumentInTransaction, createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("draft document cancellation database integration", () => {
  it("allows only the creator to cancel a draft and permanently rejects cancellation after submission", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار إلغاء المسودة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات تهيئة إلغاء المسودة غير مكتملة");
    const rollback = new Error("intentional cancellation test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `cancel-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ المسودة", role: "user" });
        const otherResult = await tx.insert(users).values({ openId: `${suffix}-other`, name: "مستخدم آخر", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const otherId = Number(otherResult[0].insertId);
        const context = { company, branch, period };
        const draft = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "مسودة قابلة للإلغاء", quantity: 1, unitPriceMinor: 100, discountMinor: 0 }] });
        await expect(cancelAccountingDocumentInTransaction(tx as never, company.id, { documentId: draft.id, userId: otherId })).rejects.toThrow("منشئ المستند");
        await expect(cancelAccountingDocumentInTransaction(tx as never, company.id, { documentId: draft.id, userId: creatorId })).resolves.toEqual({ status: "cancelled" });
        const [cancelled] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, draft.id)).limit(1);
        expect(cancelled?.status).toBe("cancelled");
        const audit = await tx.select().from(accountingAuditEvents).where(and(eq(accountingAuditEvents.entityId, draft.id), eq(accountingAuditEvents.action, "draftCancelled"))).limit(1);
        expect(audit).toHaveLength(1);

        const submitted = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "مسودة مرسلة", quantity: 1, unitPriceMinor: 100, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, submitted.id, creatorId);
        await expect(cancelAccountingDocumentInTransaction(tx as never, company.id, { documentId: submitted.id, userId: creatorId })).rejects.toThrow("لا يمكن إلغاء إلا مستند مسودة");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
