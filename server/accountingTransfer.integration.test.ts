import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountingApprovals,
  accountingBranches,
  accountingCompanies,
  accountingDocuments,
  accountingFiscalPeriods,
  accountingWarehouseVariantBalances,
  accountingWarehouses,
  inventoryItems,
  inventoryMovements,
  inventoryVariants,
  users,
} from "../drizzle/schema";
import { approveAndPostDocumentInTransaction, createAccountingDocumentInTransaction, submitDocumentForApprovalInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("stock transfer database integration", () => {
  it("posts a transfer with paired movements while preserving the company-wide quantity", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار تكامل التحويل");

    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    if (!company) throw new Error("يجب تهيئة الشركة الأساسية قبل اختبار تحويل المخزون");
    const [branch] = await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1);
    const [period] = await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1);
    const [approver] = await database.select().from(users).limit(1);
    if (!branch || !period || !approver) throw new Error("بيانات تهيئة التحويل غير مكتملة");
    const [sourceWarehouse] = await database.select().from(accountingWarehouses).where(eq(accountingWarehouses.branchId, branch.id)).limit(1);
    if (!sourceWarehouse) throw new Error("لا يوجد مخزن مصدر للاختبار");

    const rollback = new Error("intentional stock-transfer test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `transfer-test-${Date.now()}`;
        const creatorResult = await tx.insert(users).values({ openId: `${suffix}-creator`, name: "منشئ اختبار التحويل", role: "user" });
        const creatorId = Number(creatorResult[0].insertId);
        const destinationResult = await tx.insert(accountingWarehouses).values({ branchId: branch.id, code: `T${Date.now().toString().slice(-8)}`, name: "مخزن وجهة اختبار التحويل" });
        const destinationWarehouseId = Number(destinationResult[0].insertId);
        const itemResult = await tx.insert(inventoryItems).values({ name: "صنف اختبار تحويل ذري", createdBy: creatorId });
        const itemId = Number(itemResult[0].insertId);
        const variantResult = await tx.insert(inventoryVariants).values({ itemId, barcode: suffix, stockQuantity: 10 });
        const variantId = Number(variantResult[0].insertId);
        await tx.insert(accountingWarehouseVariantBalances).values({ warehouseId: sourceWarehouse.id, variantId, quantity: 10 });
        const draft = await createAccountingDocumentInTransaction(tx as never, { company, branch, period }, {
          userId: creatorId,
          type: "stockTransfer",
          warehouseId: sourceWarehouse.id,
          destinationWarehouseId,
          currencyCode: "USD",
          exchangeRatePpm: 1_000_000,
          note: "اختبار تكامل متراجع",
          lines: [{ variantId, description: "تحويل ثلاث وحدات", quantity: 3, unitPriceMinor: 0, discountMinor: 0 }],
        });
        expect(draft.status).toBe("draft");
        const documentId = draft.id;
        await expect(submitDocumentForApprovalInTransaction(tx as never, company.id, documentId, creatorId)).resolves.toEqual({ status: "pendingApproval" });

        const result = await approveAndPostDocumentInTransaction(tx as never, { company, branch, period }, documentId, approver.id);
        expect(result).toMatchObject({ journalEntryId: null, status: "posted" });

        const balances = await tx.select().from(accountingWarehouseVariantBalances).where(eq(accountingWarehouseVariantBalances.variantId, variantId));
        expect(balances.map(row => ({ warehouseId: row.warehouseId, quantity: row.quantity })).sort((left, right) => left.warehouseId - right.warehouseId)).toEqual([
          { warehouseId: sourceWarehouse.id, quantity: 7 },
          { warehouseId: destinationWarehouseId, quantity: 3 },
        ].sort((left, right) => left.warehouseId - right.warehouseId));
        expect(balances.reduce((total, row) => total + row.quantity, 0)).toBe(10);
        const movements = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.variantId, variantId));
        expect(movements.map(row => ({ type: row.type, quantity: row.quantity })).sort((left, right) => left.type.localeCompare(right.type))).toEqual([
          { type: "in", quantity: 3 },
          { type: "out", quantity: 3 },
        ]);
        const [postedDocument] = await tx.select().from(accountingDocuments).where(eq(accountingDocuments.id, documentId)).limit(1);
        expect(postedDocument?.status).toBe("posted");
        const [approval] = await tx.select().from(accountingApprovals).where(and(eq(accountingApprovals.entityType, "document"), eq(accountingApprovals.entityId, documentId))).limit(1);
        expect(approval?.status).toBe("approved");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
