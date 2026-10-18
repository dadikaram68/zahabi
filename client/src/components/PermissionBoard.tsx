import { formatDateTime } from "@/lib/dateTime";
import React, { useState } from "react";
import {
  Archive,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const menuPermissionOptions = [
  ["menu.dashboard", "لوحة التحكم"],
  ["menu.accounting", "المحاسبة والمالية"],
  ["menu.items", "الأصناف والمخزون"],
  ["menu.movements", "حركات المخزون"],
  ["menu.reports", "تقارير المخزون"],
  ["menu.partners", "الموردون والعملاء"],
  ["menu.invoices", "الفواتير"],
  ["menu.backups", "النسخ الاحتياطي والاستعادة"],
] as const;

const actionPermissionOptions = [
  ["accounting.read", "قراءة المحاسبة والتقارير"],
  ["inventory.read", "قراءة الأصناف والمخزون"],
  ["commerce.read", "قراءة الموردين والعملاء والفواتير"],
  ["documents.create", "إنشاء المستندات"],
  ["documents.financial.create", "إنشاء المستندات المالية"],
  ["documents.editHistorical", "تعديل المستندات القديمة"],
  ["documents.approve", "اعتماد وترحيل المستندات"],
  ["payroll.manage", "إدارة الرواتب والحضور"],
  ["inventory.manage", "إدارة الأصناف وحركات المخزون"],
  ["commerce.manage", "إدارة الشركاء والفواتير"],
  ["accounting.manage", "إدارة إعدادات الشركة المالية"],
  ["accounting.cash.opening", "اعتماد وترحيل رصيد الصندوق لليوم التالي"],
  ["accounting.cash.approve", "اعتماد المقبوضات والمصروفات اليومية"],
  ["backups.manage", "إنشاء واستعادة النسخ الاحتياطية"],
  ["permissions.manage", "إدارة الأقسام والأدوار والمديرين"],
] as const;
const permissionOptions = [
  ...menuPermissionOptions,
  ...actionPermissionOptions,
] as const;

type EditingRole = { id: number; name: string; permissions: string[] } | null;

export function PermissionBoard() {
  const utils = trpc.useUtils();
  const access = trpc.accounting.access.useQuery();
  const config = trpc.accounting.accessConfiguration.useQuery();
  const [auditPage, setAuditPage] = useState(1);
  const auditLog = trpc.accounting.permissionActivityLog.useQuery({
    page: auditPage,
    pageSize: 20,
  });
  const [archivePage, setArchivePage] = useState(1);
  const auditArchive = trpc.accounting.permissionActivityArchive.useQuery({
    page: archivePage,
    pageSize: 20,
  });
  const [name, setName] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<string[]>([
    "menu.items",
    "menu.movements",
  ]);
  const [editingRole, setEditingRole] = useState<EditingRole>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<number, string>
  >({});
  const [internalUser, setInternalUser] = useState({
    name: "",
    username: "",
    password: "",
    roleId: "",
    branchId: "",
  });
  const [replacementPassword, setReplacementPassword] = useState("");
  const refresh = () => {
    utils.accounting.accessConfiguration.invalidate();
    utils.accounting.permissionActivityLog.invalidate();
    utils.accounting.permissionActivityArchive.invalidate();
  };
  const canGrantSystemAdmin =
    access.data?.roles?.includes("system_admin") ?? false;
  const createRole = trpc.accounting.createCustomRole.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الدور المخصص");
      setName("");
      setDraftPermissions(["accounting.read"]);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const updatePermissions = trpc.accounting.updateRolePermissions.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث صلاحيات الدور");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const updateRole = trpc.accounting.updateCustomRole.useMutation({
    onSuccess: () => {
      toast.success("تم تعديل الدور بنجاح");
      setEditingRole(null);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const deleteRole = trpc.accounting.deleteCustomRole.useMutation({
    onSuccess: () => {
      toast.success("تم حذف الدور المخصص");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const assignRole = trpc.accounting.assignRole.useMutation({
    onSuccess: () => {
      toast.success("تم تغيير دور المستخدم");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const createInternalUser = trpc.accounting.createInternalUser.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء حساب الدخول الداخلي");
      setInternalUser({
        name: "",
        username: "",
        password: "",
        roleId: "",
        branchId: "",
      });
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const updateInternalUser = trpc.accounting.updateInternalUser.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث حالة الحساب");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const resetInternalPassword =
    trpc.accounting.resetInternalUserPassword.useMutation({
      onSuccess: () => {
        toast.success("تمت إعادة تعيين كلمة المرور");
        setReplacementPassword("");
      },
      onError: error => toast.error(error.message),
    });
  const archiveActivity = trpc.accounting.archivePermissionActivity.useMutation(
    {
      onSuccess: () => {
        toast.success("تم حذف السجل من القائمة وأرشفته لمدة ثلاثة أشهر");
        refresh();
      },
      onError: error => toast.error(error.message),
    }
  );
  if (!config.data || !access.data?.canManagePermissions) return null;
  const permissionsFor = (roleId: number) =>
    config.data.rolePermissions
      .filter(row => row.roleId === roleId && row.isAllowed)
      .map(row => row.permission);
  const toggleDraft = (permission: string) =>
    setDraftPermissions(current =>
      current.includes(permission)
        ? current.filter(item => item !== permission)
        : [...current, permission]
    );
  const startEditing = (role: { id: number; name: string }) => {
    const current = permissionsFor(role.id);
    setEditingRole({
      id: role.id,
      name: role.name,
      permissions: current.includes("*")
        ? permissionOptions.map(([permission]) => permission)
        : current,
    });
  };
  const toggleEditingPermission = (permission: string) =>
    setEditingRole(current =>
      current
        ? {
            ...current,
            permissions: current.permissions.includes(permission)
              ? current.permissions.filter(item => item !== permission)
              : [...current.permissions, permission],
          }
        : current
    );
  const copyRole = (role: { id: number; name: string }) => {
    setName(`نسخة من ${role.name}`);
    setDraftPermissions(permissionsFor(role.id));
    setEditingRole(null);
    window.setTimeout(
      () =>
        document
          .getElementById("new-role-form")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0
    );
    toast.success("تم نسخ القوائم والصلاحيات إلى نموذج دور جديد");
  };
  const applyManagerPreset = () => {
    setName("مدير");
    setDraftPermissions([
      ...menuPermissionOptions.map(([permission]) => permission),
      ...actionPermissionOptions
        .filter(([permission]) => permission !== "permissions.manage")
        .map(([permission]) => permission),
    ]);
    setEditingRole(null);
    toast.success(
      "تم تجهيز قالب مدير بصلاحيات التشغيل الكاملة دون إدارة الأدوار"
    );
  };
  const auditActionLabel = (action: string) =>
    ({
      customRoleCreated: "إنشاء دور",
      customRoleUpdated: "تعديل دور",
      customRoleDeleted: "حذف دور",
      permissionsUpdated: "تعديل الصلاحيات",
      assigned: "تعيين دور لمستخدم",
      internalUserCreated: "إنشاء مستخدم",
      internalUserUpdated: "تحديث مستخدم",
      internalUserPasswordReset: "إعادة تعيين كلمة المرور",
    })[action] ?? action;
  const auditDetails = (value: string | null) => {
    if (!value) return "—";
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return Object.entries(parsed)
        .map(
          ([key, item]) =>
            `${key}: ${Array.isArray(item) ? item.join(", ") : String(item ?? "—")}`
        )
        .join(" · ");
    } catch {
      return value;
    }
  };
  return (
    <section className="ops-card rounded-3xl p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="ops-kicker">إدارة كاملة وواضحة</p>
          <h3 className="mt-1 text-2xl font-black">لوحة الصلاحيات والأدوار</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            مدير النظام يملك كل الصلاحيات والقوائم، ويستطيع إضافة مدير نظام آخر.
            يمكنك إنشاء دور مخصص، اختيار القوائم التي تظهر له، تحديد الإجراءات
            المسموحة، وتعديل الدور أو حذفه عند عدم ارتباطه بأي مستخدم.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-950/35 dark:text-amber-100">
          <ShieldCheck className="h-4 w-4" />
          كل تغيير يسجل للمراجعة
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-7 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-100">
        <p className="font-black">طريقة الاستخدام</p>
        <p>
          1) اختر القوائم التي ستظهر للدور. 2) اختر الإجراءات التي يستطيع
          تنفيذها. 3) أنشئ الدور أو اضغط تعديل الدور لحفظ الاسم والقوائم
          والصلاحيات. الأدوار الأساسية محمية لأنها مرتبطة بمنطق النظام، بينما
          الأدوار المخصصة قابلة للتعديل والحذف.
        </p>
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
        <form
          id="new-role-form"
          className="rounded-2xl border border-border bg-muted/35 p-5"
          onSubmit={event => {
            event.preventDefault();
            createRole.mutate({ name, permissions: draftPermissions });
          }}
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-blue-700" />
            <p className="text-lg font-black">دور مخصص جديد</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            اكتب دوراً جديداً أو استخدم «نسخ الدور» من بطاقة موجودة. صلاحية
            إدارة الشركة تتضمن القراءة تلقائياً، لكن قالب المدير يملأ القوائم
            والإجراءات التشغيلية دفعة واحدة.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            onClick={applyManagerPreset}
          >
            تعبئة قالب مدير كامل
          </Button>
          <label className="mt-5 grid gap-1.5 text-sm font-bold">
            اسم الدور
            <input
              required
              value={name}
              onChange={event => setName(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-base font-normal"
            />
          </label>
          <PermissionChecks
            title="القوائم التي ستظهر لهذا الدور"
            options={menuPermissionOptions}
            permissions={draftPermissions}
            onToggle={toggleDraft}
          />
          <PermissionChecks
            title="الإجراءات المسموحة"
            options={actionPermissionOptions}
            permissions={draftPermissions}
            onToggle={toggleDraft}
          />
          <Button
            disabled={createRole.isPending}
            className="mt-5 h-11 w-full bg-[#0d54c5] text-sm font-black hover:bg-[#0b469f]"
          >
            {createRole.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            إنشاء الدور
          </Button>
        </form>
        <div className="grid gap-3 md:grid-cols-2">
          {config.data.roles.map(role => {
            const permissions = permissionsFor(role.id);
            const protectedRole = role.isSystem;
            const isEditing = editingRole?.id === role.id;
            return (
              <article
                key={role.id}
                className="rounded-2xl border border-border bg-card p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        aria-label={`اسم الدور ${role.name}`}
                        value={editingRole.name}
                        onChange={event =>
                          setEditingRole(current =>
                            current
                              ? { ...current, name: event.target.value }
                              : current
                          )
                        }
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-lg font-black"
                      />
                    ) : (
                      <p className="text-lg font-black">{role.name}</p>
                    )}
                    <p className="mt-1 text-xs font-bold text-muted-foreground">
                      {protectedRole
                        ? "مدير النظام · كل الصلاحيات والقوائم"
                        : "دور مخصص قابل للتفويض"}{" "}
                      · {role.code}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`نسخ الدور ${role.name}`}
                      onClick={() => copyRole(role)}
                    >
                      نسخ الدور
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`تعديل الدور ${role.name}`}
                      onClick={() =>
                        isEditing ? setEditingRole(null) : startEditing(role)
                      }
                    >
                      {isEditing ? (
                        <X className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`حذف الدور ${role.name}`}
                      className="text-red-700 hover:bg-red-50 hover:text-red-800"
                      disabled={deleteRole.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "سيتم حذف الدور فقط إذا لم يكن مرتبطاً بأي مستخدم. هل تريد المتابعة؟"
                          )
                        )
                          deleteRole.mutate({ roleId: role.id });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  {isEditing ? (
                    <>
                      <PermissionChecks
                        title="القوائم لهذا الدور"
                        options={menuPermissionOptions}
                        permissions={editingRole.permissions}
                        onToggle={toggleEditingPermission}
                      />
                      <PermissionChecks
                        title="الإجراءات لهذا الدور"
                        options={actionPermissionOptions}
                        permissions={editingRole.permissions}
                        onToggle={toggleEditingPermission}
                      />
                      <Button
                        type="button"
                        className="mt-3 w-full bg-emerald-700 hover:bg-emerald-800"
                        disabled={
                          updateRole.isPending ||
                          editingRole.name.trim().length < 2
                        }
                        onClick={() =>
                          updateRole.mutate({
                            roleId: role.id,
                            name: editingRole.name.trim(),
                            permissions: editingRole.permissions,
                          })
                        }
                      >
                        {updateRole.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        حفظ تعديل الدور
                      </Button>
                    </>
                  ) : (
                    <PermissionChecks
                      title="الصلاحيات الحالية"
                      options={permissionOptions}
                      permissions={permissions}
                      disabled={updatePermissions.isPending}
                      onToggle={permission =>
                        updatePermissions.mutate({
                          roleId: role.id,
                          permissions: permissions.includes(permission)
                            ? permissions.filter(item => item !== permission)
                            : [...permissions, permission],
                        })
                      }
                    />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <section className="mt-6 rounded-2xl border border-border bg-muted/20 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-white">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-black">
              حسابات الدخول اليومية والمديرون
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              أنشئ لكل موظف اسماً وكلمة مرور ودوراً واضحاً. مدير النظام يستطيع
              إنشاء مدير نظام إضافي، بينما لا يستطيع الدور المخصص منح نفسه
              صلاحيات الإدارة.
            </p>
          </div>
        </div>
        <form
          className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          onSubmit={event => {
            event.preventDefault();
            if (!internalUser.roleId) return;
            createInternalUser.mutate({
              name: internalUser.name.trim(),
              username: internalUser.username.trim(),
              password: internalUser.password,
              roleId: Number(internalUser.roleId),
              branchId: internalUser.branchId
                ? Number(internalUser.branchId)
                : undefined,
            });
          }}
        >
          <label className="grid gap-1 text-sm font-bold">
            اسم الموظف
            <input
              aria-label="اسم مستخدم الحساب الداخلي"
              required
              value={internalUser.name}
              onChange={event =>
                setInternalUser(current => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            اسم الدخول
            <input
              aria-label="اسم الدخول الداخلي"
              required
              pattern="[a-zA-Z0-9._-]{3,64}"
              value={internalUser.username}
              onChange={event =>
                setInternalUser(current => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            />
            <span className="text-[11px] font-normal text-muted-foreground">
              استخدم أحرفاً إنجليزية وأرقاماً مثل abbas.manager؛ الاسم الظاهر
              يمكن أن يكون عربياً.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            كلمة المرور
            <input
              aria-label="كلمة مرور الحساب الداخلي"
              type="password"
              minLength={10}
              required
              value={internalUser.password}
              onChange={event =>
                setInternalUser(current => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            />
            <span className="text-[11px] font-normal text-muted-foreground">
              10 محارف على الأقل، مع حرف كبير وحرف صغير ورقم.
            </span>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            الدور
            <select
              aria-label="دور الحساب الداخلي"
              required
              value={internalUser.roleId}
              onChange={event =>
                setInternalUser(current => ({
                  ...current,
                  roleId: event.target.value,
                }))
              }
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            >
              <option value="">اختر الدور</option>
              {config.data.roles
                .filter(
                  role => canGrantSystemAdmin || role.code !== "system_admin"
                )
                .map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-bold">
            تقييد بفرع
            <select
              aria-label="فرع الحساب الداخلي"
              value={internalUser.branchId}
              onChange={event =>
                setInternalUser(current => ({
                  ...current,
                  branchId: event.target.value,
                }))
              }
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            >
              <option value="">كل الفروع</option>
              {config.data.branches
                .filter(branch => branch.isActive)
                .map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={createInternalUser.isPending}
            className="h-10 bg-[#0d54c5] font-black hover:bg-[#0b469f] md:col-span-2 xl:col-span-5"
          >
            {createInternalUser.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            إنشاء الحساب
          </Button>
        </form>
        <div className="mt-5 grid gap-3">
          {config.data.users
            .filter(user => user.isInternalUser)
            .map(user => {
              const assignment = config.data.assignments.find(
                row => row.userId === user.id
              );
              return (
                <article
                  key={user.id}
                  className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <p className="font-black">
                      {user.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({user.username})
                      </span>
                    </p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">
                      {assignment?.roleName ?? "دون دور"} ·{" "}
                      {user.isActive ? "نشط" : "موقوف"}
                    </p>
                  </div>
                  <label className="grid gap-1 text-sm font-bold">
                    تغيير الدور
                    <select
                      aria-label={`الدور الجديد للمستخدم ${user.name}`}
                      value={
                        assignmentDrafts[user.id] ??
                        String(assignment?.roleId ?? "")
                      }
                      onChange={event =>
                        setAssignmentDrafts(current => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
                    >
                      <option value="">اختر دوراً</option>
                      {config.data.roles
                        .filter(
                          role =>
                            canGrantSystemAdmin || role.code !== "system_admin"
                        )
                        .map(role => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      !assignmentDrafts[user.id] ||
                      assignmentDrafts[user.id] ===
                        String(assignment?.roleId ?? "") ||
                      assignRole.isPending
                    }
                    onClick={() =>
                      assignRole.mutate({
                        targetUserId: user.id,
                        roleId: Number(assignmentDrafts[user.id]),
                        branchId: assignment?.branchId ?? undefined,
                      })
                    }
                  >
                    حفظ الدور
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      updateInternalUser.mutate({
                        targetUserId: user.id,
                        isActive: !user.isActive,
                      })
                    }
                  >
                    {user.isActive ? "إيقاف الحساب" : "تفعيل الحساب"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      replacementPassword.length < 10 ||
                      resetInternalPassword.isPending
                    }
                    onClick={() =>
                      resetInternalPassword.mutate({
                        targetUserId: user.id,
                        password: replacementPassword,
                      })
                    }
                  >
                    <RotateCcw className="h-4 w-4" />
                    إعادة تعيين
                  </Button>
                </article>
              );
            })}
        </div>
        {config.data.users.some(user => user.isInternalUser) && (
          <label className="mt-4 grid max-w-md gap-1 text-sm font-bold">
            كلمة مرور بديلة (10 أحرف أو أكثر)
            <input
              aria-label="كلمة المرور البديلة"
              type="password"
              minLength={10}
              value={replacementPassword}
              onChange={event => setReplacementPassword(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
            />
          </label>
        )}
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-lg font-black">
                سجل نشاطات الأدوار والصلاحيات
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                يعرض التعديلات على صفحات صغيرة لتحميل أسرع، مع اسم المنفذ
                والتاريخ والوقت والقيم السابقة والجديدة. يمكنك حذف النشاط من
                القائمة فوراً؛ ينتقل إلى أرشيف محفوظ ثلاثة أشهر ثم يُحذف
                تلقائياً.
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              {auditLog.data?.total ?? 0} نشاط
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {auditLog.isLoading ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                جارٍ تحميل سجل النشاطات…
              </p>
            ) : (auditLog.data?.events ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                لا توجد تعديلات مسجلة بعد.
              </p>
            ) : (
              (auditLog.data?.events ?? []).map(event => (
                <article
                  key={event.id}
                  className="rounded-xl border border-border/70 bg-muted/20 p-4"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-black">
                        {auditActionLabel(event.action)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">
                        {event.performedByName}
                        {event.performedByUsername
                          ? ` · ${event.performedByUsername}`
                          : ""}{" "}
                        · {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                    <span className="rounded-lg bg-background px-2 py-1 text-xs font-bold text-muted-foreground">
                      {event.entityType} #{event.entityId}
                    </span>
                  </div>
                  {(event.beforeJson || event.afterJson) && (
                    <div className="mt-3 grid gap-2 text-xs leading-6 md:grid-cols-2">
                      <p className="rounded-lg bg-red-50 p-2 text-red-900 dark:bg-red-950/25 dark:text-red-100">
                        <b>قبل:</b> {auditDetails(event.beforeJson)}
                      </p>
                      <p className="rounded-lg bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100">
                        <b>بعد:</b> {auditDetails(event.afterJson)}
                      </p>
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-amber-800 hover:bg-amber-50"
                      disabled={archiveActivity.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "سيُحذف النشاط من السجل الحالي وينتقل إلى أرشيف يبقى ثلاثة أشهر. هل تريد المتابعة؟"
                          )
                        )
                          archiveActivity.mutate({ eventId: event.id });
                      }}
                    >
                      <Archive className="h-4 w-4" />
                      حذف وأرشفة
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={auditPage <= 1 || auditLog.isFetching}
              onClick={() => setAuditPage(page => Math.max(1, page - 1))}
            >
              السابق
            </Button>
            <span className="text-sm font-black text-muted-foreground">
              صفحة {auditPage} من{" "}
              {Math.max(1, Math.ceil((auditLog.data?.total ?? 0) / 20))}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={
                auditLog.isFetching ||
                auditPage >=
                  Math.max(1, Math.ceil((auditLog.data?.total ?? 0) / 20))
              }
              onClick={() => setAuditPage(page => page + 1)}
            >
              التالي
            </Button>
          </div>
        </section>
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/35 p-5 dark:border-amber-900/50 dark:bg-amber-950/15">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-lg font-black">أرشيف النشاطات المحذوفة</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                تظهر هنا السجلات التي حُذفت من القائمة الرئيسية، وتبقى قابلة
                للمراجعة حتى انتهاء ثلاثة أشهر من تاريخ الأرشفة.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              {auditArchive.data?.total ?? 0} مؤرشف
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {auditArchive.isLoading ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                جارٍ تحميل الأرشيف…
              </p>
            ) : (auditArchive.data?.events ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                لا توجد سجلات مؤرشفة حالياً.
              </p>
            ) : (
              (auditArchive.data?.events ?? []).map(event => (
                <article
                  key={event.id}
                  className="rounded-xl border border-amber-200/70 bg-card p-4 dark:border-amber-900/50"
                >
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                    <div>
                      <p className="font-black">
                        {auditActionLabel(event.action)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">
                        {event.performedByName}
                        {event.performedByUsername
                          ? ` · ${event.performedByUsername}`
                          : ""}{" "}
                        · أُرشف في{" "}
                        {formatDateTime(event.archivedAt)}
                      </p>
                    </div>
                    <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                      ينتهي{" "}
                      {new Date(event.expiresAt).toLocaleDateString("ar-IQ")}
                    </span>
                  </div>
                  {(event.beforeJson || event.afterJson) && (
                    <div className="mt-3 grid gap-2 text-xs leading-6 md:grid-cols-2">
                      <p className="rounded-lg bg-red-50 p-2 text-red-900 dark:bg-red-950/25 dark:text-red-100">
                        <b>قبل:</b> {auditDetails(event.beforeJson)}
                      </p>
                      <p className="rounded-lg bg-emerald-50 p-2 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100">
                        <b>بعد:</b> {auditDetails(event.afterJson)}
                      </p>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-amber-200/70 pt-4 dark:border-amber-900/50">
            <Button
              type="button"
              variant="outline"
              disabled={archivePage <= 1 || auditArchive.isFetching}
              onClick={() => setArchivePage(page => Math.max(1, page - 1))}
            >
              السابق
            </Button>
            <span className="text-sm font-black text-muted-foreground">
              صفحة {archivePage} من{" "}
              {Math.max(1, Math.ceil((auditArchive.data?.total ?? 0) / 20))}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={
                auditArchive.isFetching ||
                archivePage >=
                  Math.max(1, Math.ceil((auditArchive.data?.total ?? 0) / 20))
              }
              onClick={() => setArchivePage(page => page + 1)}
            >
              التالي
            </Button>
          </div>
        </section>
      </section>
    </section>
  );
}

function PermissionChecks({
  title,
  options,
  permissions,
  onToggle,
  disabled = false,
}: {
  title: string;
  options: readonly (readonly [string, string])[];
  permissions: string[];
  onToggle: (permission: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-black">{title}</p>
      <div className="mt-2 grid gap-2">
        {options.map(([permission, label]) => (
          <label
            key={permission}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold ${disabled ? "opacity-60" : "hover:bg-muted"}`}
          >
            <input
              type="checkbox"
              checked={
                permissions.includes("*") || permissions.includes(permission)
              }
              disabled={disabled}
              onChange={() => onToggle(permission)}
              className="h-4 w-4 accent-blue-700"
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
