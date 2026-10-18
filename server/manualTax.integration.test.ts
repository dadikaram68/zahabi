import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAuditEvents, accountingBranches, accountingCompanies, accountingDocumentLines, accountingDocuments, accountingFiscalPeriods, accountingWarehouseVariantBalances, accountingWarehouses, inventoryItems, inventoryVariants, users } from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, calculateManualTaxInTransaction, createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("manual tax calculation database integration", () => {
  it("aggregates posted invoices and returns by selected period or one document without changing source documents", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الضريبة اليدوية");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    const [warehouse] = branch ? await database.select().from(accountingWarehouses).where(eq(accountingWarehouses.branchId, branch.id)).limit(1) : [];
    if (!company || !branch || !period || !approver || !warehouse) throw new Error("بيانات تهيئة اختبار الضريبة اليدوية غير مكتملة");
    const rollback = new Error("intentional manual-tax test rollback");

    try {
      await database.transaction(async tx => {
        const suffix = `manual-tax-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار الضريبة", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const itemResult = await tx.insert(inventoryItems).values({ name: "صنف اختبار الضريبة اليدوية", createdBy: creatorId });
        const itemId = Number(itemResult[0].insertId);
        const variantResult = await tx.insert(inventoryVariants).values({ itemId, barcode: suffix, stockQuantity: 0, averageCostUsdMinor: 0, inventoryValueUsdMinor: 0 });
        const variantId = Number(variantResult[0].insertId);
        await tx.insert(accountingWarehouseVariantBalances).values({ warehouseId: warehouse.id, variantId, quantity: 0 });
        const context = { company, branch, period };

        const purchase = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseInvoice", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "شراء عشرة", quantity: 10, unitPriceMinor: 10_005, discountMinor: 5 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchase.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, purchase.id, approver.id);
        const [purchaseLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, purchase.id)).limit(1);

        const purchaseReturn = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseReturn", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, sourceDocumentLineId: purchaseLine!.id, description: "مرتجع شراء اثنين", quantity: 2, unitPriceMinor: 10_005, discountMinor: 1 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchaseReturn.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, purchaseReturn.id, approver.id);

        const sale = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "saleInvoice", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "بيع أربعة", quantity: 4, unitPriceMinor: 20_003, discountMinor: 3 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, sale.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, sale.id, approver.id);
        const [saleLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, sale.id)).limit(1);

        const saleReturn = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "salesReturn", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, sourceDocumentLineId: saleLine!.id, description: "مرتجع بيع واحد", quantity: 1, unitPriceMinor: 20_003, discountMinor: 1 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, saleReturn.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, saleReturn.id, approver.id);

        await Promise.all([
          tx.update(accountingDocuments).set({ postedAt: new Date("2026-08-05T10:00:00.000Z") }).where(eq(accountingDocuments.id, purchase.id)),
          tx.update(accountingDocuments).set({ postedAt: new Date("2026-08-10T10:00:00.000Z") }).where(eq(accountingDocuments.id, sale.id)),
          tx.update(accountingDocuments).set({ postedAt: new Date("2026-08-15T10:00:00.000Z") }).where(eq(accountingDocuments.id, purchaseReturn.id)),
          tx.update(accountingDocuments).set({ postedAt: new Date("2026-08-20T10:00:00.000Z") }).where(eq(accountingDocuments.id, saleReturn.id)),
        ]);

        const periodResult = await calculateManualTaxInTransaction(tx as never, { userId: creatorId, companyId: company.id, rateBps: 1_250, startDate: "2026-08-01", endDate: "2026-08-31" });
        expect(periodResult).toMatchObject({ basis: "operational", documentCount: 4, outputTaxUsdMinor: 7_501, inputTaxUsdMinor: 10_005, netTaxPayableUsdMinor: -2_504 });
        expect(periodResult.currencySummaries).toEqual([expect.objectContaining({ currencyCode: "USD", salesNetMinor: 60_007, outputTaxMinor: 7_501, purchaseNetMinor: 80_036, inputTaxMinor: 10_005, netTaxMinor: -2_504 })]);

        const documentResult = await calculateManualTaxInTransaction(tx as never, { userId: creatorId, companyId: company.id, rateBps: 1_250, documentId: sale.id });
        expect(documentResult).toMatchObject({ documentCount: 1, outputTaxUsdMinor: 10_001, inputTaxUsdMinor: 0, netTaxPayableUsdMinor: 10_001 });

        const emptyResult = await calculateManualTaxInTransaction(tx as never, { userId: creatorId, companyId: company.id, rateBps: 1_250, startDate: "2026-09-01", endDate: "2026-09-30" });
        expect(emptyResult).toMatchObject({ documentCount: 0, currencySummaries: [], outputTaxUsdMinor: 0, inputTaxUsdMinor: 0, netTaxPayableUsdMinor: 0 });

        const sourceDocuments = await tx.select({ id: accountingDocuments.id, taxRateBps: accountingDocuments.taxRateBps, taxMinor: accountingDocuments.taxMinor, totalMinor: accountingDocuments.totalMinor, subtotalMinor: accountingDocuments.subtotalMinor, discountMinor: accountingDocuments.discountMinor }).from(accountingDocuments).where(and(eq(accountingDocuments.companyId, company.id), eq(accountingDocuments.createdBy, creatorId)));
        expect(sourceDocuments).toEqual(expect.arrayContaining([expect.objectContaining({ id: purchase.id, taxRateBps: 0, taxMinor: 0, totalMinor: 100_045, subtotalMinor: 100_050, discountMinor: 5 }), expect.objectContaining({ id: sale.id, taxRateBps: 0, taxMinor: 0, totalMinor: 80_009, subtotalMinor: 80_012, discountMinor: 3 })]));
        const auditRows = await tx.select().from(accountingAuditEvents).where(and(eq(accountingAuditEvents.entityType, "manualTaxCalculation"), eq(accountingAuditEvents.performedBy, creatorId)));
        expect(auditRows).toHaveLength(3);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 15_000);
});
