import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { accountingBranches, accountingCompanies, accountingCostCenters, accountingDocuments, accountingFiscalPeriods, accountingJournalLines, users } from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, listActiveCostCentersInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("cost center active-list database integration", () => {
  it("excludes a deactivated center from the active attribution list", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار مراكز التكلفة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    if (!company) throw new Error("الشركة الأساسية غير موجودة");
    const rollback = new Error("intentional cost-center test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = Date.now();
        await tx.insert(accountingCostCenters).values([
          { companyId: company.id, code: `ACTIVE-${suffix}`, name: "مركز نشط", isActive: true },
          { companyId: company.id, code: `OFF-${suffix}`, name: "مركز موقوف", isActive: false },
        ]);
        const active = await listActiveCostCentersInTransaction(tx as never, company.id);
        expect(active.some(center => center.code === `ACTIVE-${suffix}`)).toBe(true);
        expect(active.some(center => center.code === `OFF-${suffix}`)).toBe(false);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });

  it("attributes an active center to a posted document and all resulting journal lines", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار إسناد مركز التكلفة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("سياق الشركة أو الفرع أو الفترة غير مكتمل");
    const rollback = new Error("intentional cost-center-attribution test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = Date.now();
        const ownerResult = await tx.insert(users).values({ openId: `cost-owner-${suffix}`, name: "منشئ مستند", role: "user" });
        const reviewerResult = await tx.insert(users).values({ openId: `cost-reviewer-${suffix}`, name: "معتمد مستند", role: "user" });
        const ownerId = Number(ownerResult[0].insertId);
        const reviewerId = Number(reviewerResult[0].insertId);
        const activeResult = await tx.insert(accountingCostCenters).values({ companyId: company.id, code: `OPS-${suffix}`, name: "عمليات", isActive: true });
        const inactiveResult = await tx.insert(accountingCostCenters).values({ companyId: company.id, code: `OFF-${suffix}`, name: "موقوف", isActive: false });
        const activeCostCenterId = Number(activeResult[0].insertId);
        const inactiveCostCenterId = Number(inactiveResult[0].insertId);
        const context = { company, branch, period };
        await expect(createAccountingDocumentInTransaction(tx as never, context, { userId: ownerId, type: "saleInvoice", costCenterId: inactiveCostCenterId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "خدمة اختبار", quantity: 1, unitPriceMinor: 1_000 }] })).rejects.toThrow("مركز التكلفة غير فعال");
        const document = await createAccountingDocumentInTransaction(tx as never, context, { userId: ownerId, type: "saleInvoice", costCenterId: activeCostCenterId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ description: "خدمة اختبار", quantity: 1, unitPriceMinor: 1_000 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, document.id, ownerId);
        const posted = await approveAndPostDocumentInTransaction(tx as never, context, document.id, reviewerId);
        const [storedDocument] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, document.id)).limit(1);
        const lines = posted.journalEntryId ? await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, posted.journalEntryId)) : [];
        expect(storedDocument?.costCenterId).toBe(activeCostCenterId);
        expect(lines).toHaveLength(2);
        expect(lines.every(line => line.costCenterId === activeCostCenterId)).toBe(true);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
