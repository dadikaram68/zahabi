import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountingPermissions: vi.fn(),
  getAccountingRoleCodes: vi.fn(),
}));
vi.mock("./accountingDb", () => mocks);

import { hasDelegatedAppPermission } from "./appPermissions";

describe("delegated app permissions", () => {
  beforeEach(() => {
    mocks.getAccountingPermissions.mockReset();
    mocks.getAccountingRoleCodes.mockReset();
  });
  it("permits the owner and existing unassigned users without breaking historical access", async () => {
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "admin",
        permission: "inventory.manage",
      })
    ).resolves.toBe(true);
    mocks.getAccountingPermissions.mockResolvedValue([]);
    mocks.getAccountingRoleCodes.mockResolvedValue([]);
    await expect(
      hasDelegatedAppPermission({
        userId: 2,
        globalRole: "user",
        permission: "inventory.manage",
      })
    ).resolves.toBe(true);
  });
  it("enforces a delegated section permission when the user has a role assignment", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue(["custom_sales"]);
    mocks.getAccountingPermissions.mockResolvedValue(["commerce.manage"]);
    await expect(
      hasDelegatedAppPermission({
        userId: 3,
        globalRole: "user",
        permission: "commerce.manage",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 3,
        globalRole: "user",
        permission: "inventory.manage",
      })
    ).resolves.toBe(false);
  });
  it("inherits read access from the matching management permission", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue(["custom_manager"]);
    mocks.getAccountingPermissions.mockResolvedValue([
      "inventory.manage",
      "accounting.manage",
      "commerce.manage",
    ]);
    await expect(
      hasDelegatedAppPermission({
        userId: 4,
        globalRole: "user",
        permission: "inventory.read",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 4,
        globalRole: "user",
        permission: "accounting.read",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 4,
        globalRole: "user",
        permission: "commerce.read",
      })
    ).resolves.toBe(true);
  });
  it("grants all permissions to a user with the wildcard permission", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue([]);
    mocks.getAccountingPermissions.mockResolvedValue(["*"]);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.manage",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "commerce.read",
      })
    ).resolves.toBe(true);
  });
  it("grants a section wildcard to every permission in that section only", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue([]);
    mocks.getAccountingPermissions.mockResolvedValue(["inventory.*"]);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.manage",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.read",
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "commerce.manage",
      })
    ).resolves.toBe(false);
  });
  it("honors legacy role assignments", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue(["legacy_manager"]);
    mocks.getAccountingPermissions.mockResolvedValue([]);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.manage",
        legacyRoles: ["legacy_manager"],
      })
    ).resolves.toBe(true);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.manage",
        legacyRoles: ["other_role"],
      })
    ).resolves.toBe(false);
  });
  it("does not inherit unassigned access when allowUnassignedLegacy is false", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue([]);
    mocks.getAccountingPermissions.mockResolvedValue([]);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "inventory.read",
        allowUnassignedLegacy: false,
      })
    ).resolves.toBe(false);
  });
  it("returns false for an unknown permission with no matching role or permission", async () => {
    mocks.getAccountingRoleCodes.mockResolvedValue(["custom_sales"]);
    mocks.getAccountingPermissions.mockResolvedValue(["commerce.manage"]);
    await expect(
      hasDelegatedAppPermission({
        userId: 1,
        globalRole: "user",
        permission: "backups.manage",
      })
    ).resolves.toBe(false);
  });
});
