import { eq, inArray } from "drizzle-orm";
import { cleanup, render, screen, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../../../server/_core/context";
import { createCustomAccountingRole, assignAccountingRole, updateAccountingRolePermissions } from "../../../server/accountingDb";
import { accountingAuditEvents, accountingCompanies, accountingRolePermissions, accountingRoles, accountingUserRoles, users } from "../../../drizzle/schema";
import { accountingRouter } from "../../../server/routers/accounting";
import { getDb } from "../../../server/db";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  branding: vi.fn(),
  overview: vi.fn(),
  history: vi.fn(),
  partnerManagement: vi.fn(),
  partnerSearchResults: vi.fn(),
  invoiceManagement: vi.fn(),
  user: null as { id: number; openId: string; name: string; email: null; loginMethod: null; username: string | null; passwordHash: string | null; isInternalUser: boolean; isActive: boolean; lastInternalSignedIn: Date | null; mfaEnabled: boolean; mfaMode: "totp" | "email" | null; mfaSecretEncrypted: string | null; role: "user"; createdAt: Date; updatedAt: Date; lastSignedIn: Date } | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, loading: false }) }));
vi.mock("@/contexts/ThemeContext", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("@/components/DashboardLayout", () => ({ default: ({ children, navigation }: { children: React.ReactNode; navigation: Array<{ key: string; label: string }> }) => <main><nav data-testid="layout-navigation">{navigation.map(item => <span key={item.key}>{item.label}</span>)}</nav>{children}</main> }));
vi.mock("@/components/AccountingWorkspace", () => ({ AccountingWorkspace: () => null }));
vi.mock("@/components/BackupManagement", () => ({ BackupManagement: () => null }));
vi.mock("@/components/SectionGuide", () => ({ SectionGuide: () => null }));
vi.mock("@/components/InventoryOperations", () => ({ AnalyticsCharts: () => null, InvoiceManagement: () => { mocks.invoiceManagement(); return null; }, MovementTrendChart: () => null, PartnerManagement: () => { mocks.partnerManagement(); return null; }, PartnerSearchResults: () => { mocks.partnerSearchResults(); return null; } }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ inventory: { overview: { invalidate: vi.fn() }, history: { invalidate: vi.fn() } } }),
  accounting: { access: { useQuery: mocks.access }, publicBranding: { useQuery: mocks.branding } },
  inventory: {
    overview: { useQuery: mocks.overview },
    history: { useQuery: mocks.history },
    addItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    recordMovement: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    updateSettings: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    updateItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
} }));

import Home from "./Home";

const emptyOverview = { data: { items: [{ id: 71, name: "صنف قراءة فقط", lowStockThreshold: null, imageUrl: null, imageKey: null, variants: [{ id: 701, color: null, size: null, barcode: "READ-ONLY", stockQuantity: 5 }] }], recentMovements: [], settings: { defaultLowStockThreshold: 5 } }, isLoading: false };

describe("persisted delegated role to Home integration", () => {
  afterEach(() => { cleanup(); mocks.access.mockReset(); mocks.branding.mockReset(); mocks.overview.mockReset(); mocks.history.mockReset(); mocks.partnerManagement.mockReset(); mocks.partnerSearchResults.mockReset(); mocks.invoiceManagement.mockReset(); mocks.user = null; window.history.replaceState({}, "", "/"); });

  it("renders only the sections and query access granted by the custom role returned from the real access router", async () => {
    const database = await getDb();
    if (!database) throw new Error("قاعدة البيانات غير متاحة لاختبار الدور والواجهة");
    const [company] = await database.select().from(accountingCompanies).where(eq(accountingCompanies.companyKey, "PRIMARY")).limit(1);
    if (!company) throw new Error("يجب تهيئة الشركة الأساسية قبل اختبار الدور والواجهة");
    const suffix = `home-role-${Date.now()}`;
    let ownerId = 0;
    let userId = 0;
    let roleId = 0;
    try {
      const ownerResult = await database.insert(users).values({ openId: `${suffix}-owner`, name: "مالك اختبار الواجهة", role: "admin" });
      const userResult = await database.insert(users).values({ openId: `${suffix}-user`, name: "موظف اختبار الواجهة", role: "user" });
      ownerId = Number(ownerResult[0].insertId);
      userId = Number(userResult[0].insertId);
      const role = await createCustomAccountingRole({ userId: ownerId, isOwner: true, name: "مشرف مخزون واجهة", permissions: ["inventory.read"] });
      roleId = role.id;
      await updateAccountingRolePermissions({ userId: ownerId, isOwner: true, roleId, permissions: ["inventory.read", "accounting.read"] });
      await assignAccountingRole({ userId: ownerId, isOwner: true, targetUserId: userId, roleId });

      const userContext: TrpcContext = {
        user: { id: userId, openId: `${suffix}-user`, name: "موظف اختبار الواجهة", email: null, loginMethod: null, username: null, passwordHash: null, isInternalUser: false, isActive: true, lastInternalSignedIn: null, mfaEnabled: false, mfaMode: "totp", mfaSecretEncrypted: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
        req: {} as TrpcContext["req"],
        res: {} as TrpcContext["res"],
      };
      const access = await accountingRouter.createCaller(userContext).access();
      expect(access).toMatchObject({ canAccess: true, permissions: ["inventory.read", "accounting.read"] });

      mocks.user = { id: userId, openId: `${suffix}-user`, name: "موظف اختبار الواجهة", email: null, loginMethod: null, username: null, passwordHash: null, isInternalUser: false, isActive: true, lastInternalSignedIn: null, mfaEnabled: false, mfaMode: "totp", mfaSecretEncrypted: null, role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
      mocks.access.mockReturnValue({ data: access });
      mocks.branding.mockReturnValue({ data: { brandName: null, brandLogoUrl: null, showProductName: true } });
      mocks.overview.mockReturnValue(emptyOverview);
      mocks.history.mockReturnValue({ data: [], isLoading: false });
      window.history.replaceState({}, "", "/?view=items");
      const allowedView = render(<Home />);

      expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: true });
      const navigation = within(screen.getByTestId("layout-navigation"));
      expect(navigation.getByText("الأصناف")).toBeTruthy();
      expect(navigation.getByText("الحركات")).toBeTruthy();
      expect(navigation.getByText("التقارير")).toBeTruthy();
      expect(navigation.queryByText("الموردون والعملاء")).toBeNull();
      expect(navigation.queryByText("الفواتير")).toBeNull();
      expect(navigation.queryByText("النسخ الاحتياطي")).toBeNull();
      expect(screen.queryByText("الموردون والعملاء")).toBeNull();
      expect(screen.queryByText("الفواتير")).toBeNull();
      expect(screen.queryByText("النسخ الاحتياطي")).toBeNull();
      expect(screen.queryByRole("button", { name: "إضافة صنف" })).toBeNull();
      expect(screen.queryByRole("button", { name: "إدخال مخزون" })).toBeNull();
      expect(screen.queryByRole("button", { name: "إخراج مخزون" })).toBeNull();

      allowedView.unmount();
      mocks.overview.mockClear();
      mocks.history.mockClear();
      mocks.partnerManagement.mockClear();
      mocks.partnerSearchResults.mockClear();
      mocks.invoiceManagement.mockClear();
      window.history.replaceState({}, "", "/?view=partners");
      render(<Home />);
      expect(screen.getAllByText("المحاسبة والمالية").length).toBeGreaterThan(0);
      expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: false });
      expect(mocks.history.mock.calls[0]?.[1]).toEqual({ enabled: false });
      expect(mocks.partnerManagement).not.toHaveBeenCalled();
      expect(mocks.partnerSearchResults).not.toHaveBeenCalled();
      expect(mocks.invoiceManagement).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "إضافة صنف" })).toBeNull();
    } finally {
      if (ownerId) await database.delete(accountingAuditEvents).where(eq(accountingAuditEvents.performedBy, ownerId));
      if (userId) await database.delete(accountingUserRoles).where(eq(accountingUserRoles.userId, userId));
      if (roleId) await database.delete(accountingRolePermissions).where(eq(accountingRolePermissions.roleId, roleId));
      if (roleId) await database.delete(accountingRoles).where(eq(accountingRoles.id, roleId));
      if (ownerId || userId) await database.delete(users).where(inArray(users.id, [ownerId, userId].filter(Boolean)));
    }
  });
});
