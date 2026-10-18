import { describe, expect, it } from "vitest";
import {
  getHomeSectionAccess,
  getHomeViewAccess,
} from "../shared/homeAccess";

describe("home section access", () => {
  it("shows only explicitly delegated inventory sections to a role-assigned warehouse user", () => {
    const access = getHomeSectionAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(access.sections).toEqual([
      "dashboard",
      "items",
      "movements",
      "reports",
    ]);
    expect(access.inventoryManage).toBe(false);
    expect(access.commerce).toBe(false);
    expect(access.backups).toBe(false);
  });
  it("keeps owner access and blocks a direct backup section for a delegated inventory-only user", () => {
    const owner = getHomeSectionAccess({
      isOwner: true,
      roles: ["system_admin"],
      permissions: ["*"],
      hasAccessRecord: true,
      canAccessAccounting: true,
    });
    expect(owner.sections).toContain("backups");
    const staff = getHomeSectionAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.manage"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(staff.sections).not.toContain("backups");
    expect(staff.inventoryManage).toBe(true);
  });
  it("respects explicit menu permissions for dashboard visibility", () => {
    const access = getHomeSectionAccess({
      isOwner: false,
      roles: ["custom_manager"],
      permissions: ["menu.items", "inventory.manage"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(access.sections).not.toContain("dashboard");
    expect(access.sections).toContain("items");
  });
  it("grants backups only to the owner or backups.manage permission", () => {
    const owner = getHomeSectionAccess({
      isOwner: true,
      roles: [],
      permissions: [],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(owner.backups).toBe(true);
    expect(owner.sections).toContain("backups");

    const withPerm = getHomeSectionAccess({
      isOwner: false,
      roles: [],
      permissions: ["backups.manage"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(withPerm.backups).toBe(true);
    expect(withPerm.sections).toContain("backups");

    const without = getHomeSectionAccess({
      isOwner: false,
      roles: [],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(without.backups).toBe(false);
    expect(without.sections).not.toContain("backups");
  });
  it("blocks backups for a delegated inventory-only user", () => {
    const staff = getHomeSectionAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.manage"],
      hasAccessRecord: true,
      canAccessAccounting: false,
    });
    expect(staff.backups).toBe(false);
    expect(staff.sections).not.toContain("backups");
  });
  it("marks a view blocked when the section is not accessible", () => {
    const result = getHomeViewAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
      hasUser: true,
      activeView: "backups",
    });
    expect(result.isBlocked).toBe(true);
    expect(result.canReadInventory).toBe(true);
  });
  it("allows the accounting view when canAccessAccounting and the section is visible", () => {
    const result = getHomeViewAccess({
      isOwner: false,
      roles: [],
      permissions: ["*"],
      hasAccessRecord: true,
      canAccessAccounting: true,
      hasUser: true,
      activeView: "accounting",
    });
    expect(result.isBlocked).toBe(false);
    expect(result.sections).toContain("accounting");
  });
  it("treats accountingMovements as accessible when accounting is visible", () => {
    const result = getHomeViewAccess({
      isOwner: false,
      roles: [],
      permissions: ["*"],
      hasAccessRecord: true,
      canAccessAccounting: true,
      hasUser: true,
      activeView: "accountingMovements",
    });
    expect(result.isBlocked).toBe(false);
  });
  it("blocks inventory history when the active view is not movements or reports", () => {
    const result = getHomeViewAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
      hasUser: true,
      activeView: "items",
    });
    expect(result.canReadInventory).toBe(true);
    expect(result.canReadInventoryHistory).toBe(false);
  });
  it("allows inventory history for movements and reports views", () => {
    const movements = getHomeViewAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
      hasUser: true,
      activeView: "movements",
    });
    expect(movements.canReadInventoryHistory).toBe(true);

    const reports = getHomeViewAccess({
      isOwner: false,
      roles: ["custom_warehouse"],
      permissions: ["inventory.read"],
      hasAccessRecord: true,
      canAccessAccounting: false,
      hasUser: true,
      activeView: "reports",
    });
    expect(reports.canReadInventoryHistory).toBe(true);
  });
});
