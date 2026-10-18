import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingAccounts, accountingBranches, accountingCompanies, accountingDocumentLines, accountingFiscalPeriods, accountingJournalEntries, accountingJournalLines, accountingWarehouseVariantBalances, accountingWarehouses, inventoryItems, inventoryVariants, users } from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("purchase return database integration", () => {
  it("reverses an approved purchase from its source line, inventory value, payable, and inventory accounts", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار مرتجع المشتريات");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [approver] = await database.select().from(users).limit(1);
    const [warehouse] = branch ? await database.select().from(accountingWarehouses).where(eq(accountingWarehouses.branchId, branch.id)).limit(1) : [];
    if (!company || !branch || !period || !approver || !warehouse) throw new Error("بيانات تهيئة اختبار مرتجع المشتريات غير مكتملة");
    const rollback = new Error("intentional purchase-return test rollback");

    try {
      await database.transaction(async tx => {
        const suffix = `purchase-return-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار مرتجع الشراء", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const itemResult = await tx.insert(inventoryItems).values({ name: "صنف اختبار مرتجع شراء", createdBy: creatorId });
        const itemId = Number(itemResult[0].insertId);
        const variantResult = await tx.insert(inventoryVariants).values({ itemId, barcode: suffix, stockQuantity: 0, averageCostUsdMinor: 0, inventoryValueUsdMinor: 0 });
        const variantId = Number(variantResult[0].insertId);
        await tx.insert(accountingWarehouseVariantBalances).values({ warehouseId: warehouse.id, variantId, quantity: 0 });
        const context = { company, branch, period };

        const purchase = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseInvoice", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "شراء خمس وحدات", quantity: 5, unitPriceMinor: 120, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchase.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, purchase.id, approver.id);
        const [purchaseLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, purchase.id)).limit(1);

        const purchaseReturn = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseReturn", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, sourceDocumentLineId: purchaseLine!.id, description: "مرتجع وحدتين من الشراء", quantity: 2, unitPriceMinor: 120, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, purchaseReturn.id, creatorId);
        await approveAndPostDocumentInTransaction(tx as never, context, purchaseReturn.id, approver.id);
        const [afterReturn] = await tx.select().from(inventoryVariants).where(eq(inventoryVariants.id, variantId)).limit(1);
        const [warehouseBalance] = await tx.select().from(accountingWarehouseVariantBalances).where(and(eq(accountingWarehouseVariantBalances.warehouseId, warehouse.id), eq(accountingWarehouseVariantBalances.variantId, variantId))).limit(1);
        expect(afterReturn).toMatchObject({ stockQuantity: 3, inventoryValueUsdMinor: 360, averageCostUsdMinor: 120 });
        expect(warehouseBalance?.quantity).toBe(3);
        const journal = await tx.select({ code: accountingAccounts.code, debit: accountingJournalLines.baseDebitMinor, credit: accountingJournalLines.baseCreditMinor, currencyCode: accountingJournalLines.currencyCode })
          .from(accountingJournalLines).innerJoin(accountingJournalEntries, eq(accountingJournalLines.journalEntryId, accountingJournalEntries.id)).innerJoin(accountingAccounts, eq(accountingJournalLines.accountId, accountingAccounts.id)).where(eq(accountingJournalEntries.sourceId, purchaseReturn.id));
        expect(journal).toEqual(expect.arrayContaining([expect.objectContaining({ code: "2110", debit: 240, credit: 0, currencyCode: "USD" }), expect.objectContaining({ code: "1130", debit: 0, credit: 240, currencyCode: "USD" })]));

        const excessive = await createAccountingDocumentInTransaction(tx as never, context, { userId: creatorId, type: "purchaseReturn", warehouseId: warehouse.id, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, sourceDocumentLineId: purchaseLine!.id, description: "مرتجع زائد", quantity: 4, unitPriceMinor: 120, discountMinor: 0 }] });
        await submitDocumentForApprovalInTransaction(tx as never, company.id, excessive.id, creatorId);
        await expect(approveAndPostDocumentInTransaction(tx as never, context, excessive.id, approver.id)).rejects.toThrow("كمية المرتجع تتجاوز كمية الشراء الأصلية");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
