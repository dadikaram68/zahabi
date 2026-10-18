import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingCompanies, accountingRoles, accountingUserRoles, users } from "../drizzle/schema";
import { assignAccountingRoleInTransaction, getInternalUserInCompanyInTransaction } from "./accountingDb";
import { getDb } from "./db";

describe("internal user company scope integration", () => {
  it("only resolves an internal account through a role assigned in the current company", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار عزل الحساب الداخلي");
    const [primaryCompany] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    if (!primaryCompany) throw new Error("يجب تهيئة الشركة الأساسية لاختبار عزل الحساب الداخلي");

    const rollback = new Error("intentional internal-user company-scope rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `internal-scope-${Date.now()}`;
        const ownerResult = await tx.insert(users).values({ openId: `${suffix}-owner`, name: "مالك اختبار العزل", role: "admin" });
        const internalResult = await tx.insert(users).values({ openId: `${suffix}-internal`, name: "مستخدم داخلي اختبار", role: "user", username: `${suffix}-user`, passwordHash: "scrypt$test$hash", isInternalUser: true, isActive: true, loginMethod: "internal" });
        const ownerId = Number(ownerResult[0].insertId);
        const internalUserId = Number(internalResult[0].insertId);
        const companyResult = await tx.insert(accountingCompanies).values({ companyKey: `${suffix}`.slice(0, 30), name: "شركة اختبار أخرى" });
        const otherCompanyId = Number(companyResult[0].insertId);
        const primaryRoleResult = await tx.insert(accountingRoles).values({ companyId: primaryCompany.id, code: `${suffix}-primary`.slice(0, 40), name: "دور الشركة الأساسية" });
        const otherRoleResult = await tx.insert(accountingRoles).values({ companyId: otherCompanyId, code: `${suffix}-other`.slice(0, 40), name: "دور الشركة الأخرى" });
        const primaryRoleId = Number(primaryRoleResult[0].insertId);
        const otherRoleId = Number(otherRoleResult[0].insertId);

        await tx.insert(accountingUserRoles).values({ userId: internalUserId, roleId: otherRoleId, assignedBy: ownerId });
        await expect(getInternalUserInCompanyInTransaction(tx as never, primaryCompany.id, internalUserId)).rejects.toThrow("غير موجود ضمن الشركة الحالية");
        await expect(assignAccountingRoleInTransaction(tx as never, primaryCompany.id, { userId: ownerId, targetUserId: internalUserId, roleId: primaryRoleId, isOwner: true })).rejects.toThrow("خارج الشركة الحالية");
        await expect(getInternalUserInCompanyInTransaction(tx as never, otherCompanyId, internalUserId)).resolves.toMatchObject({ id: internalUserId, isActive: true });

        await expect(assignAccountingRoleInTransaction(tx as never, primaryCompany.id, { userId: ownerId, targetUserId: internalUserId, roleId: primaryRoleId, isOwner: true, allowUnassignedTarget: true })).resolves.toEqual({ success: true });
        await expect(getInternalUserInCompanyInTransaction(tx as never, primaryCompany.id, internalUserId)).resolves.toMatchObject({ id: internalUserId });
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
