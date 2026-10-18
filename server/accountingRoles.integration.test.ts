import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { accountingCompanies, accountingRoles, accountingUserRoles, users } from "../drizzle/schema";
import { getHomeViewAccess } from "../shared/homeAccess";
import {
  assignAccountingRoleInTransaction,
  createCustomAccountingRoleInTransaction,
  getAccountingPermissionsInTransaction,
  getAccountingRoleCodesInTransaction,
  updateAccountingRolePermissionsInTransaction,
} from "./accountingDb";
import { getDb } from "./db";

describe("custom accounting role database integration", () => {
  it("persists a custom role's changed permissions and assigned access within a rollback transaction", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار تكامل الأدوار");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    if (!company) throw new Error("يجب تهيئة الشركة الأساسية قبل اختبار الأدوار");

    const rollback = new Error("intentional custom-role test rollback");
    try {
      await database.transaction(async tx => {
        const suffix = `custom-role-${Date.now()}`;
        const ownerResult = await tx.insert(users).values({ openId: `${suffix}-owner`, name: "مالك اختبار الدور", role: "admin" });
        const targetResult = await tx.insert(users).values({ openId: `${suffix}-employee`, name: "موظف اختبار الدور", role: "user" });
        const ownerId = Number(ownerResult[0].insertId);
        const targetUserId = Number(targetResult[0].insertId);

        const created = await createCustomAccountingRoleInTransaction(tx as never, company.id, {
          userId: ownerId,
          isOwner: true,
          name: "مشرف مخزون اختبار",
          permissions: ["inventory.read"],
        });
        await expect(updateAccountingRolePermissionsInTransaction(tx as never, company.id, {
          userId: ownerId,
          isOwner: true,
          roleId: created.id,
          permissions: ["inventory.read", "accounting.read"],
        })).resolves.toEqual({ success: true });
        await expect(assignAccountingRoleInTransaction(tx as never, company.id, {
          userId: ownerId,
          targetUserId,
          roleId: created.id,
          isOwner: true,
          allowUnassignedTarget: true,
        })).resolves.toEqual({ success: true });

        const [role] = await tx.select().from(accountingRoles).where(eq(accountingRoles.id, created.id)).limit(1);
        const assignments = await tx.select().from(accountingUserRoles).where(eq(accountingUserRoles.userId, targetUserId));
        const roleCodes = await getAccountingRoleCodesInTransaction(tx as never, targetUserId);
        const permissions = await getAccountingPermissionsInTransaction(tx as never, targetUserId);
        expect(role).toMatchObject({ id: created.id, name: "مشرف مخزون اختبار", isSystem: false });
        expect(assignments).toHaveLength(1);
        expect(assignments[0]).toMatchObject({ userId: targetUserId, roleId: created.id, assignedBy: ownerId });
        expect(roleCodes).toEqual([role!.code]);
        expect(permissions.sort()).toEqual(["accounting.read", "inventory.read"]);
        const inventoryDashboard = getHomeViewAccess({
          isOwner: false,
          roles: roleCodes,
          permissions,
          hasAccessRecord: true,
          canAccessAccounting: permissions.includes("accounting.read"),
          hasUser: true,
          activeView: "dashboard",
        });
        const blockedCommerce = getHomeViewAccess({
          isOwner: false,
          roles: roleCodes,
          permissions,
          hasAccessRecord: true,
          canAccessAccounting: permissions.includes("accounting.read"),
          hasUser: true,
          activeView: "partners",
        });
        expect(inventoryDashboard.sections).toEqual(["dashboard", "accounting", "items", "movements", "reports"]);
        expect(inventoryDashboard.canReadInventory).toBe(true);
        expect(inventoryDashboard.canReadInventoryHistory).toBe(false);
        expect(inventoryDashboard.isBlocked).toBe(false);
        expect(blockedCommerce.canReadInventory).toBe(true);
        expect(blockedCommerce.commerce).toBe(false);
        expect(blockedCommerce.sections).not.toContain("partners");
        expect(blockedCommerce.sections).not.toContain("invoices");
        expect(blockedCommerce.isBlocked).toBe(true);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  });
});
