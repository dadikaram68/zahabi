import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountingAccounts,
  accountingBranches,
  accountingCompanies,
  accountingDocumentLines,
  accountingFiscalPeriods,
  accountingJournalEntries,
  accountingJournalLines,
  accountingWarehouseVariantBalances,
  accountingWarehouses,
  inventoryItems,
  inventoryVariants,
  users,
} from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("inventory valuation database integration", () => {
  it("posts weighted-average cost of goods sold for a sale and reverses it for a sales return", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار تقييم المخزون");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !approver) throw new Error("بيانات تهيئة تقييم المخزون غير مكتملة");
    const [sourceWarehouse] = await database.select().from(accountingWarehouses).where(eq(accountingWarehouses.branchId, branch.id)).limit(1);
    if (!sourceWarehouse) throw new Error("لا يوجد مخزن مصدر لاختبار تقييم المخزون");

    const rollback = new Error("intentional inventory-valuation test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `valuation-test-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار تقييم المخزون", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const itemResult = await tx.insert(inventoryItems).values({ name: "صنف اختبار متوسط التكلفة", createdBy: creatorId });
        const itemId = Number(itemResult[0].insertId);
        const variantResult = await tx.insert(inventoryVariants).values({ itemId, barcode: suffix, stockQuantity: 10, averageCostUsdMinor: 125, inventoryValueUsdMinor: 1_250 });
        const variantId = Number(variantResult[0].insertId);
        await tx.insert(accountingWarehouseVariantBalances).values({ warehouseId: sourceWarehouse.id, variantId, quantity: 10 });

        const sale = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, { userId: creatorId, type: "saleInvoice", warehouseId: sourceWarehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "بيع كامل الرصيد", quantity: 10, unitPriceMinor: 300, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, sale.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, { company, branch, period }, sale.id, approver.id);
        const [afterSale] = await tx.select().from(inventoryVariants).where(eq(inventoryVariants.id, variantId)).limit(1);
        const [sourceSaleLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, sale.id)).limit(1);
        expect(afterSale).toMatchObject({ stockQuantity: 0, averageCostUsdMinor: 0, inventoryValueUsdMinor: 0 });
        expect(sourceSaleLine?.unitCostUsdMinor).toBe(125);

        const salesJournal = await tx.select({ code: accountingAccounts.code, debit: accountingJournalLines.baseDebitMinor, credit: accountingJournalLines.baseCreditMinor, currencyCode: accountingJournalLines.currencyCode })
          .from(accountingJournalLines).innerJoin(accountingJournalEntries, eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)).innerJoin(accountingAccounts, eq(accountingJournalLines.accountId, accountingAccounts.id)).where(eq(accountingJournalEntries.sourceId, sale.id));
        expect(salesJournal).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "5100", debit: 1_250, credit: 0, currencyCode: "USD" }),
          expect.objectContaining({ code: "1130", debit: 0, credit: 1_250, currencyCode: "USD" }),
        ]));

        const purchase = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, { userId: creatorId, type: "purchaseInvoice", warehouseId: sourceWarehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "وصول تكلفة جديدة", quantity: 5, unitPriceMinor: 200, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchase.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, { company, branch, period }, purchase.id, approver.id);
        const [afterPurchase] = await tx.select().from(inventoryVariants).where(eq(inventoryVariants.id, variantId)).limit(1);
        expect(afterPurchase).toMatchObject({ stockQuantity: 5, averageCostUsdMinor: 200, inventoryValueUsdMinor: 1_000 });

        const salesReturn = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, { userId: creatorId, type: "salesReturn", warehouseId: sourceWarehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, sourceDocumentLineId: sourceSaleLine!.id, description: "مرتجع وحدتين من البيع الأصلي", quantity: 2, unitPriceMinor: 300, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, salesReturn.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, { company, branch, period }, salesReturn.id, approver.id);
        const [afterReturn] = await tx.select().from(inventoryVariants).where(eq(inventoryVariants.id, variantId)).limit(1);
        expect(afterReturn).toMatchObject({ stockQuantity: 7, averageCostUsdMinor: 179, inventoryValueUsdMinor: 1_250 });

        const returnJournal = await tx.select({ code: accountingAccounts.code, debit: accountingJournalLines.baseDebitMinor, credit: accountingJournalLines.baseCreditMinor, currencyCode: accountingJournalLines.currencyCode })
          .from(accountingJournalLines).innerJoin(accountingJournalEntries, eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)).innerJoin(accountingAccounts, eq(accountingJournalLines.accountId, accountingAccounts.id)).where(eq(accountingJournalEntries.sourceId, salesReturn.id));
        expect(returnJournal).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "1130", debit: 250, credit: 0, currencyCode: "USD" }),
          expect.objectContaining({ code: "5100", debit: 0, credit: 250, currencyCode: "USD" }),
        ]));
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  }, 15_000);
});
