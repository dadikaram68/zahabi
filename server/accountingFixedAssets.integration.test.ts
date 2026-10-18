import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountingAccounts,
  accountingAssetDepreciation,
  accountingBranches,
  accountingCompanies,
  accountingFixedAssets,
  accountingFiscalPeriods,
  accountingJournalEntries,
  accountingJournalLines,
  users,
} from "../drizzle/schema";
import { createFixedAssetInTransaction, listFixedAssetsInTransaction, postFixedAssetDepreciationInTransaction } from "./accountingDb";
import { getDb } from "./db";

function periodKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonthKey(date: Date) {
  return periodKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
}

describe("fixed asset database integration", () => {
  it("capitalizes an asset, posts balanced monthly depreciation, and blocks a duplicate month", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الأصول الثابتة");

    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    const [branch] = company ? await database.select().from(accountingBranches).where(eq(accountingBranches.companyId, company.id)).limit(1) : [];
    const [period] = company ? await database.select().from(accountingFiscalPeriods).where(and(eq(accountingFiscalPeriods.companyId, company.id), eq(accountingFiscalPeriods.status, "open"))).limit(1) : [];
    const [actor] = await database.select().from(users).limit(1);
    if (!company || !branch || !period || !actor) throw new Error("بيانات تهيئة الأصول الثابتة غير مكتملة");

    const acquiredAt = new Date(Date.UTC(period.startsOn.getUTCFullYear(), period.startsOn.getUTCMonth(), 1));
    const depreciationMonth = nextMonthKey(acquiredAt);
    if (new Date(`${depreciationMonth}-01T00:00:00.000Z`) > period.endsOn) throw new Error("الفترة المالية المختبرة لا تتسع لشهر إهلاك تالٍ");
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const rollback = new Error("intentional fixed-asset test rollback");

    try {
      await database.transaction(async tx => {
        const selected = await tx.select().from(accountingAccounts).where(and(eq(accountingAccounts.companyId, company.id), eq(accountingAccounts.isActive, true)));
        const byCode = new Map(selected.map(account => [account.code, account]));
        const assetAccount = byCode.get("1300");
        const accumulatedAccount = byCode.get("1310");
        const expenseAccount = byCode.get("6300");
        const cashAccount = byCode.get("1110");
        if (!assetAccount || !accumulatedAccount || !expenseAccount || !cashAccount) throw new Error("حسابات الأصل والإهلاك غير مكتملة");

        const context = { company, branch, period };
        const created = await createFixedAssetInTransaction(tx as never, context, {
          userId: actor.id,
          assetNumber: `TEST-AST-${suffix}`,
          name: "أصل اختبار الإهلاك",
          acquiredAt,
          acquisitionMinor: 120_000,
          salvageMinor: 0,
          usefulLifeMonths: 12,
          branchId: branch.id,
          assetAccountId: assetAccount.id,
          accumulatedDepreciationAccountId: accumulatedAccount.id,
          depreciationExpenseAccountId: expenseAccount.id,
          creditAccountId: cashAccount.id,
        });

        const [asset] = await tx.select().from(accountingFixedAssets).where(eq(accountingFixedAssets.id, created.id)).limit(1);
        const capitalizationLines = await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, created.journalEntryId));
        expect(asset?.status).toBe("active");
        expect(capitalizationLines).toEqual(expect.arrayContaining([
          expect.objectContaining({ accountId: assetAccount.id, debitMinor: 120_000, creditMinor: 0 }),
          expect.objectContaining({ accountId: cashAccount.id, debitMinor: 0, creditMinor: 120_000 }),
        ]));

        const posted = await postFixedAssetDepreciationInTransaction(tx as never, context, { userId: actor.id, assetId: created.id, periodKey: depreciationMonth });
        const register = await listFixedAssetsInTransaction(tx as never, company.id);
        const depreciationLines = await tx.select().from(accountingJournalLines).where(eq(accountingJournalLines.journalEntryId, posted.journalEntryId));
        const depreciationRows = await tx.select().from(accountingAssetDepreciation).where(eq(accountingAssetDepreciation.assetId, created.id));
        const [updatedAsset] = await tx.select().from(accountingFixedAssets).where(eq(accountingFixedAssets.id, created.id)).limit(1);
        const [depreciationEntry] = await tx.select().from(accountingJournalEntries).where(eq(accountingJournalEntries.id, posted.journalEntryId)).limit(1);
        expect(posted.depreciationMinor).toBe(10_000);
        expect(register.assets).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id, assetAccountCode: "1300", accumulatedDepreciationAccountCode: "1310", depreciationExpenseAccountCode: "6300" })]));
        expect(register.depreciation).toEqual(expect.arrayContaining([expect.objectContaining({ assetId: created.id, periodKey: depreciationMonth, journalEntryId: posted.journalEntryId })]));
        expect(depreciationRows).toHaveLength(1);
        expect(updatedAsset?.accumulatedDepreciationMinor).toBe(10_000);
        expect(depreciationEntry?.status).toBe("posted");
        expect(depreciationLines).toEqual(expect.arrayContaining([
          expect.objectContaining({ accountId: expenseAccount.id, debitMinor: 10_000, creditMinor: 0 }),
          expect.objectContaining({ accountId: accumulatedAccount.id, debitMinor: 0, creditMinor: 10_000 }),
        ]));

        await expect(postFixedAssetDepreciationInTransaction(tx as never, context, { userId: actor.id, assetId: created.id, periodKey: depreciationMonth })).rejects.toThrow("بشكل متسلسل");
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
