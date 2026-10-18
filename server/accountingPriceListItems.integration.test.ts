import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingBranches, accountingCompanies, accountingDocumentLines, accountingDocuments, accountingFiscalPeriods, accountingPriceListItemTiers, accountingPriceListItems, accountingPriceLists, inventoryItems, inventoryVariants, users } from "../drizzle/schema";
import { createAccountingDocumentInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("price-list item database integration", () => {
  it("applies the stored item price to a sales draft before totals and discount approval are calculated", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار سعر الصنف");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    if (!company || !branch || !period) throw new Error("بيانات تهيئة اختبار قائمة الأسعار غير مكتملة");
    const rollback = new Error("intentional price-list test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `price-list-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار سعر القائمة", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const itemResult = await tx.insert(inventoryItems).values({ name: "صنف اختبار سعر القائمة", createdBy: creatorId });
        const variantResult = await tx.insert(inventoryVariants).values({ itemId: Number(itemResult[0].insertId), barcode: suffix });
        const variantId = Number(variantResult[0].insertId);
        const priceListResult = await tx.insert(accountingPriceLists).values({ companyId: company.id, code: suffix.slice(0, 30), name: "قائمة اختبار سعر الصنف", currencyCode: "USD", maxDiscountBps: 500 });
        const priceListId = Number(priceListResult[0].insertId);
        const baseResult = await tx.insert(accountingPriceListItems).values({ priceListId, variantId, unitPriceMinor: 250 });
        const priceListItemId = Number(baseResult[0].insertId);
        await tx.insert(accountingPriceListItemTiers).values({ priceListItemId, minimumQuantity: 5, unitPriceMinor: 200 });
        const baseDocument = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, { userId: creatorId, type: "saleInvoice", priceListId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "سعر الأساس", quantity: 2, unitPriceMinor: 999, discountMinor: 0 }] });
        const tieredDocument = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, { userId: creatorId, type: "saleInvoice", priceListId, currencyCode: "USD", exchangeRatePpm: 1_000_000, lines: [{ variantId, description: "محاولة إرسال سعر يدوي", quantity: 5, unitPriceMinor: 999, discountMinor: 0 }] });
        const [savedBaseLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, baseDocument.id)).limit(1);
        const [savedTieredDocument] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, tieredDocument.id)).limit(1);
        const [savedTieredLine] = await tx.select().from(accountingDocumentLines).where(eq(accountingDocumentLines.documentId, tieredDocument.id)).limit(1);
        expect(savedBaseLine).toMatchObject({ variantId, unitPriceMinor: 250, lineTotalMinor: 500 });
        expect(savedTieredDocument).toMatchObject({ subtotalMinor: 1000, discountMinor: 0, totalMinor: 1000, priceListId });
        expect(savedTieredLine).toMatchObject({ variantId, unitPriceMinor: 200, lineTotalMinor: 1000 });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
