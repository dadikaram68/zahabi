import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAuditEvents, accountingBranches, accountingCompanies, accountingDocumentLines, accountingDocuments, accountingFiscalPeriods, users } from "../drizzle/schema";
import { createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction, updateAccountingDocumentDraftInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("accounting document draft update integration", () => {
  it("lets only the creator amend a draft, records the change, and locks it after submission", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار تعديل المسودة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [creator, otherUser] = await database.select().from(users).limit(2);
    if (!company || !branch || !period || !creator || !otherUser) throw new Error("بيانات تهيئة اختبار تعديل المسودة غير مكتملة");
    const context = { company, branch, period };
    const rollback = new Error("intentional draft-update test rollback");

    try {
      await database.transaction(async tx => {
        const created = await createAccountingDocumentInTransaction(tx as never, context, { userId: creator.id, type: "saleInvoice", currencyCode: "USD", exchangeRatePpm: 1_000_000, note: "مسودة أولى", lines: [{ description: "خدمة أولى", quantity: 1, unitPriceMinor: 1_000 }] });
        await expect(updateAccountingDocumentDraftInTransaction(tx as never, context, { userId: otherUser.id, documentId: created.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, note: "تعديل غير مسموح", lines: [{ description: "خدمة", quantity: 1, unitPriceMinor: 2_000 }] })).rejects.toThrow("منشئ المستند");
        const updated = await updateAccountingDocumentDraftInTransaction(tx as never, context, { userId: creator.id, documentId: created.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, note: "تعديل موثق", lines: [{ description: "خدمة محدثة", quantity: 2, unitPriceMinor: 1_500, discountMinor: 100 }] });
        const [document] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, created.id)).limit(1);
        const lines = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, created.id));
        const audits = await tx.select().from(accountingAuditEvents).where(and(eq(accountingAuditEvents.entityType, "document"), eq(accountingAuditEvents.entityId, created.id), eq(accountingAuditEvents.action, "draftUpdated")));
        expect(updated.status).toBe("draft");
        expect(document).toMatchObject({ note: "تعديل موثق", subtotalMinor: 3_000, discountMinor: 100, totalMinor: 2_900, status: "draft" });
        expect(lines).toEqual([expect.objectContaining({ description: "خدمة محدثة", quantity: 2, unitPriceMinor: 1_500, discountMinor: 100, lineTotalMinor: 2_900 })]);
        expect(audits).toHaveLength(1);
        await submitDocumentForApprovalInTransaction(tx as never, company.id, created.id, creator.id);
        await expect(updateAccountingDocumentDraftInTransaction(tx as never, context, { userId: creator.id, documentId: created.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "تعديل متأخر", quantity: 1, unitPriceMinor: 1_000 }] })).rejects.toThrow("مستند مسودة");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
