export type HomeSection =
  | "dashboard"
  | "accounting"
  | "accountingMovements"
  | "items"
  | "partners"
  | "invoices"
  | "backups"
  | "movements"
  | "reports";

export type HomeAccessInput = {
  isOwner: boolean;
  roles: string[];
  permissions: string[];
  hasAccessRecord: boolean;
  canAccessAccounting: boolean;
};

export function getHomeSectionAccess(input: HomeAccessInput) {
  const legacyUnassigned =
    !input.hasAccessRecord ||
    (input.roles.length === 0 && input.permissions.length === 0);
  const allows = (permission: string) =>
    input.permissions.includes("*") ||
    input.permissions.includes(permission) ||
    input.permissions.includes(`${permission.split(".")[0]}.*`);
  const hasExplicitMenus = input.permissions.some(permission =>
    permission.startsWith("menu.")
  );
  const menu = (section: HomeSection) =>
    !hasExplicitMenus ||
    input.isOwner ||
    input.permissions.includes("*") ||
    allows(`menu.${section}`);
  const inventory =
    input.isOwner ||
    legacyUnassigned ||
    input.roles.includes("warehouse_keeper") ||
    allows("inventory.manage") ||
    allows("inventory.read") ||
    (hasExplicitMenus && (menu("items") || menu("movements")));
  const inventoryManage =
    input.isOwner ||
    legacyUnassigned ||
    input.roles.includes("warehouse_keeper") ||
    allows("inventory.manage");
  const commerce =
    input.isOwner ||
    legacyUnassigned ||
    input.roles.some(role => ["accountant", "cashier"].includes(role)) ||
    allows("commerce.manage") ||
    allows("commerce.read") ||
    (hasExplicitMenus && (menu("partners") || menu("invoices")));
  const backups =
    input.isOwner ||
    allows("backups.manage") ||
    (hasExplicitMenus && menu("backups"));
  const sections: HomeSection[] = [];
  const canSeeDashboard =
    input.isOwner ||
    input.permissions.includes("*") ||
    (hasExplicitMenus
      ? menu("dashboard")
      : input.roles.length > 0 ||
        input.permissions.length > 0 ||
        menu("dashboard"));
  if (canSeeDashboard) sections.push("dashboard");
  if (input.canAccessAccounting && menu("accounting"))
    sections.push("accounting");
  if (inventory && menu("items")) sections.push("items");
  if (inventory && menu("movements")) sections.push("movements");
  if (inventory && menu("reports")) sections.push("reports");
  if (commerce && menu("partners")) sections.push("partners");
  if (commerce && menu("invoices")) sections.push("invoices");
  if (backups && menu("backups")) sections.push("backups");
  return { inventory, inventoryManage, commerce, backups, sections };
}

export function getHomeViewAccess(
  input: HomeAccessInput & { hasUser: boolean; activeView: HomeSection }
) {
  const sectionAccess = getHomeSectionAccess(input);
  const canReadInventory = input.hasUser && sectionAccess.inventory;
  return {
    ...sectionAccess,
    canReadInventory,
    canReadInventoryHistory:
      canReadInventory &&
      (input.activeView === "movements" || input.activeView === "reports"),
    isBlocked:
      !sectionAccess.sections.includes(input.activeView) &&
      !(input.activeView === "accountingMovements" &&
        sectionAccess.sections.includes("accounting")),
  };
}
