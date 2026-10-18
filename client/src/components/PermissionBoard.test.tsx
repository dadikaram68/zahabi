import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  assignRole: vi.fn(),
  createInternal: vi.fn(),
  updateInternal: vi.fn(),
  resetInternal: vi.fn(),
  archiveActivity: vi.fn(),
  invalidate: vi.fn(),
  access: { canManagePermissions: true, roles: ["system_admin"] as string[] },
}));
const data = {
  branches: [{ id: 1, name: "الفرع الرئيسي", code: "MAIN", isActive: true }],
  roles: [
    { id: 1, name: "مدير النظام", code: "system_admin", isSystem: true },
    { id: 2, name: "مشرف مبيعات", code: "custom_sales", isSystem: false },
  ],
  rolePermissions: [
    { roleId: 1, permission: "*", isAllowed: true },
    { roleId: 2, permission: "commerce.manage", isAllowed: true },
  ],
  users: [
    {
      id: 8,
      name: "محاسب داخلي",
      username: "accountant.one",
      isInternalUser: true,
      isActive: true,
      lastInternalSignedIn: null,
    },
  ],
  assignments: [
    {
      id: 3,
      userId: 8,
      roleId: 2,
      roleName: "مشرف مبيعات",
      roleCode: "custom_sales",
      branchId: 1,
      assignedBy: 1,
    },
  ],
  auditEvents: [
    {
      id: 91,
      entityType: "role",
      entityId: 2,
      action: "permissionsUpdated",
      beforeJson: JSON.stringify({ permissions: ["commerce.manage"] }),
      afterJson: JSON.stringify({
        permissions: ["menu.items", "menu.movements"],
      }),
      performedBy: 1,
      performedByName: "مدير النظام",
      performedByUsername: "admin",
      createdAt: new Date("2026-10-03T10:15:00Z"),
    },
  ],
  auditArchive: [],
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      accounting: {
        accessConfiguration: { invalidate: mocks.invalidate },
        permissionActivityLog: { invalidate: mocks.invalidate },
        permissionActivityArchive: { invalidate: mocks.invalidate },
      },
    }),
    accounting: {
      access: { useQuery: () => ({ data: mocks.access }) },
      accessConfiguration: { useQuery: () => ({ data }) },
      permissionActivityLog: {
        useQuery: () => ({
          data: {
            events: data.auditEvents,
            total: data.auditEvents.length,
            page: 1,
            pageSize: 20,
          },
          isLoading: false,
          isFetching: false,
        }),
      },
      permissionActivityArchive: {
        useQuery: () => ({
          data: {
            events: data.auditArchive,
            total: data.auditArchive.length,
            page: 1,
            pageSize: 20,
          },
          isLoading: false,
          isFetching: false,
        }),
      },
      createCustomRole: {
        useMutation: () => ({ mutate: mocks.create, isPending: false }),
      },
      updateRolePermissions: {
        useMutation: () => ({ mutate: mocks.update, isPending: false }),
      },
      updateCustomRole: {
        useMutation: () => ({ mutate: mocks.updateRole, isPending: false }),
      },
      deleteCustomRole: {
        useMutation: () => ({ mutate: mocks.deleteRole, isPending: false }),
      },
      assignRole: {
        useMutation: () => ({ mutate: mocks.assignRole, isPending: false }),
      },
      createInternalUser: {
        useMutation: () => ({ mutate: mocks.createInternal, isPending: false }),
      },
      updateInternalUser: {
        useMutation: () => ({ mutate: mocks.updateInternal, isPending: false }),
      },
      resetInternalUserPassword: {
        useMutation: () => ({ mutate: mocks.resetInternal, isPending: false }),
      },
      archivePermissionActivity: {
        useMutation: () => ({
          mutate: mocks.archiveActivity,
          isPending: false,
        }),
      },
    },
  },
}));

import { PermissionBoard } from "./PermissionBoard";

describe("PermissionBoard", () => {
  beforeEach(() => {
    mocks.create.mockClear();
    mocks.update.mockClear();
    mocks.updateRole.mockClear();
    mocks.deleteRole.mockClear();
    mocks.assignRole.mockClear();
    mocks.createInternal.mockClear();
    mocks.updateInternal.mockClear();
    mocks.resetInternal.mockClear();
    mocks.archiveActivity.mockClear();
    mocks.access.canManagePermissions = true;
    mocks.access.roles = ["system_admin"];
  });
  afterEach(() => cleanup());

  it("creates a custom role and allows the system administrator to edit permissions", () => {
    render(<PermissionBoard />);
    expect(screen.getByText("لوحة الصلاحيات والأدوار")).toBeTruthy();
    const ownerCard = screen
      .getAllByText("مدير النظام")
      .map(element => element.closest("article"))
      .find(Boolean);
    const ownerOption = within(ownerCard!).getAllByRole("checkbox")[0];
    expect((ownerOption as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("اسم الدور"), {
      target: { value: "مشرف مستودع" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الدور" }));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "مشرف مستودع",
        permissions: ["menu.items", "menu.movements"],
      })
    );
  });

  it("updates an editable custom role and also exposes system-role permissions", () => {
    render(<PermissionBoard />);
    const customRoleCard = screen
      .getAllByText("مشرف مبيعات")
      .map(element => element.closest("article"))
      .find(Boolean);
    const accountingRead = within(customRoleCard!).getByLabelText(
      "المحاسبة والمالية"
    );
    expect((accountingRead as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(accountingRead);
    expect(mocks.update).toHaveBeenCalledWith({
      roleId: 2,
      permissions: ["commerce.manage", "menu.accounting"],
    });
  });

  it("shows manager controls for a custom role and saves its name and menu selection", () => {
    render(<PermissionBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "تعديل الدور مشرف مبيعات" })
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "اسم الدور مشرف مبيعات" }),
      { target: { value: "مدير مبيعات" } }
    );
    const customRoleCard = screen
      .getByRole("button", { name: "حفظ تعديل الدور" })
      .closest("article");
    fireEvent.click(within(customRoleCard!).getByLabelText("الأصناف والمخزون"));
    fireEvent.click(screen.getByRole("button", { name: "حفظ تعديل الدور" }));
    expect(mocks.updateRole).toHaveBeenCalledWith(
      expect.objectContaining({
        roleId: 2,
        name: "مدير مبيعات",
        permissions: expect.arrayContaining(["menu.items"]),
      })
    );
  });

  it("copies an existing role into the new-role form", () => {
    render(<PermissionBoard />);
    fireEvent.click(
      screen.getByRole("button", { name: "نسخ الدور مشرف مبيعات" })
    );
    expect((screen.getByLabelText("اسم الدور") as HTMLInputElement).value).toBe(
      "نسخة من مشرف مبيعات"
    );
    expect(
      (
        screen.getAllByLabelText(
          "إدارة الشركاء والفواتير"
        )[0] as HTMLInputElement
      ).checked
    ).toBe(true);
  });

  it("changes the role of an existing internal user from the user list", () => {
    render(<PermissionBoard />);
    fireEvent.change(
      screen.getByLabelText("الدور الجديد للمستخدم محاسب داخلي"),
      { target: { value: "1" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "حفظ الدور" }));
    expect(mocks.assignRole).toHaveBeenCalledWith({
      targetUserId: 8,
      roleId: 1,
      branchId: 1,
    });
  });

  it("allows the system administrator to choose the system-admin role for a second manager", () => {
    render(<PermissionBoard />);
    expect(
      within(screen.getByLabelText("دور الحساب الداخلي")).getByRole("option", {
        name: "مدير النظام",
      })
    ).toBeTruthy();
  });

  it("offers deletion for every role while the server protects deleting the last system administrator", () => {
    render(<PermissionBoard />);
    expect(
      screen.getByRole("button", { name: "حذف الدور مشرف مبيعات" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "حذف الدور مدير النظام" })
    ).toBeTruthy();
  });

  it("creates an internal daily-login account without rendering its password in the user list", () => {
    render(<PermissionBoard />);
    fireEvent.change(screen.getByLabelText("اسم مستخدم الحساب الداخلي"), {
      target: { value: "موظف المخزن" },
    });
    fireEvent.change(screen.getByLabelText("اسم الدخول الداخلي"), {
      target: { value: "store.keeper" },
    });
    fireEvent.change(screen.getByLabelText("كلمة مرور الحساب الداخلي"), {
      target: { value: "a-secure-password" },
    });
    fireEvent.change(screen.getByLabelText("دور الحساب الداخلي"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    expect(mocks.createInternal).toHaveBeenCalledWith({
      name: "موظف المخزن",
      username: "store.keeper",
      password: "a-secure-password",
      roleId: 2,
      branchId: undefined,
    });
    expect(screen.getByText("محاسب داخلي")).toBeTruthy();
    expect(screen.queryByText("a-secure-password")).toBeNull();
  });

  it("does not render role controls for a manager without delegated permission-management authority", () => {
    mocks.access.canManagePermissions = false;
    render(<PermissionBoard />);
    expect(screen.queryByText("لوحة الصلاحيات والأدوار")).toBeNull();
    expect(screen.queryByRole("button", { name: "إنشاء الدور" })).toBeNull();
  });

  it("renders the permission activity log with actor, timestamp, and before/after details", () => {
    render(<PermissionBoard />);
    expect(screen.getByText("سجل نشاطات الأدوار والصلاحيات")).toBeTruthy();
    expect(screen.getByText("تعديل الصلاحيات")).toBeTruthy();
    expect(screen.getByText(/مدير النظام · admin/)).toBeTruthy();
    expect(screen.getByText(/قبل:/)).toBeTruthy();
    expect(screen.getByText(/بعد:/)).toBeTruthy();
  });

  it("shows paginated activity controls", () => {
    render(<PermissionBoard />);
    expect(screen.getAllByText("صفحة 1 من 1")).toHaveLength(2);
    expect(
      screen
        .getAllByRole("button", { name: "السابق" })
        .every(button => (button as HTMLButtonElement).disabled)
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: "التالي" })
        .every(button => (button as HTMLButtonElement).disabled)
    ).toBe(true);
  });

  it("archives an activity immediately and shows the three-month retention archive", () => {
    render(<PermissionBoard />);
    expect(screen.getByText("أرشيف النشاطات المحذوفة")).toBeTruthy();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "حذف وأرشفة" }));
    expect(mocks.archiveActivity).toHaveBeenCalledWith({ eventId: 91 });
  });
});
