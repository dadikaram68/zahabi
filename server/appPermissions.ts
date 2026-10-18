import {
  getAccountingPermissions,
  getAccountingRoleCodes,
} from "./accountingDb";

export async function hasDelegatedAppPermission(input: {
  userId: number;
  globalRole: "admin" | "user";
  permission: string;
  legacyRoles?: string[];
  allowUnassignedLegacy?: boolean;
}) {
  if (input.globalRole === "admin") return true;
  const [roles, permissions] = await Promise.all([
    getAccountingRoleCodes(input.userId),
    getAccountingPermissions(input.userId),
  ]);
  if (
    input.allowUnassignedLegacy !== false &&
    roles.length === 0 &&
    permissions.length === 0
  )
    return true;
  const wildcard = `${input.permission.split(".")[0]}.*`;
  const impliedReadPermissions: Record<string, string[]> = {
    "accounting.read": ["accounting.manage"],
    "inventory.read": ["inventory.manage"],
    "commerce.read": ["commerce.manage"],
  };
  return Boolean(
    (input.legacyRoles ?? []).some(role => roles.includes(role)) ||
      permissions.includes("*") ||
      permissions.includes(wildcard) ||
      permissions.includes(input.permission) ||
      impliedReadPermissions[input.permission]?.some(permission =>
        permissions.includes(permission)
      )
  );
}
