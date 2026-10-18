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
  access: vi.fn(),
  branding: vi.fn(),
  overview: vi.fn(),
  history: vi.fn(),
  user: {
    id: 11,
    openId: "custom-role-user",
    name: "موظف صلاحيات",
    email: null,
    loginMethod: null,
    role: "user" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as any,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));
vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({
    children,
    navigation,
  }: {
    children: React.ReactNode;
    navigation: Array<{ key: string; label: string }>;
  }) => (
    <main>
      <nav data-testid="layout-navigation">
        {navigation.map(item => (
          <span key={item.key}>{item.label}</span>
        ))}
      </nav>
      {children}
    </main>
  ),
}));
vi.mock("@/components/AccountingWorkspace", () => ({
  AccountingWorkspace: () => null,
}));
vi.mock("@/components/BackupManagement", () => ({
  BackupManagement: () => null,
}));
vi.mock("@/components/InternalLoginForm", () => ({
  InternalLoginForm: () => <div>بوابة دخول الموظف</div>,
}));
vi.mock("@/components/SectionGuide", () => ({ SectionGuide: () => null }));
vi.mock("@/components/InventoryOperations", () => ({
  AnalyticsCharts: () => null,
  InvoiceManagement: () => null,
  MovementTrendChart: () => null,
  PartnerManagement: () => null,
  PartnerSearchResults: () => null,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      inventory: {
        overview: { invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    accounting: {
      access: { useQuery: mocks.access },
      publicBranding: { useQuery: mocks.branding },
    },
    inventory: {
      overview: { useQuery: mocks.overview },
      history: { useQuery: mocks.history },
      addItem: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      recordMovement: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateItem: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

import Home from "./Home";

const emptyOverview = {
  data: {
    items: [],
    recentMovements: [],
    settings: { defaultLowStockThreshold: 5 },
  },
  isLoading: false,
};

describe("Home delegated access", () => {
  beforeEach(() => {
    mocks.access.mockReset();
    mocks.branding.mockReset();
    mocks.overview.mockReset();
    mocks.history.mockReset();
    mocks.user = {
      id: 11,
      openId: "custom-role-user",
      name: "موظف صلاحيات",
      email: null,
      loginMethod: null,
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_reports"],
        permissions: ["accounting.read"],
      },
    });
    mocks.branding.mockReturnValue({
      data: { brandName: null, brandLogoUrl: null, showProductName: true },
    });
    mocks.overview.mockReturnValue(emptyOverview);
    mocks.history.mockReturnValue({ data: [], isLoading: false });
  });
  afterEach(() => cleanup());

  it("does not request inventory data and redirects a commerce deep link to the first allowed section", () => {
    window.history.replaceState({}, "", "/?view=partners");
    render(<Home />);
    expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(mocks.history.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(screen.getAllByText("المحاسبة والمالية").length).toBeGreaterThan(0);
    expect(screen.queryByText("الموردون والعملاء")).toBeNull();
    expect(screen.queryByText("الفواتير")).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة صنف" })).toBeNull();
  });

  it("shows the internal employee login gate before any workspace when there is no session", () => {
    mocks.user = null;
    render(<Home />);
    expect(screen.getByText("بوابة دخول الموظف")).toBeTruthy();
    expect(screen.queryByTestId("layout-navigation")).toBeNull();
  });

  it("shows inventory navigation for an assigned inventory role while keeping commerce and backup sections hidden", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_supervisor"],
        permissions: ["accounting.read", "inventory.read"],
      },
    });
    render(<Home />);
    expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: true });
    const navigation = within(screen.getByTestId("layout-navigation"));
    expect(navigation.getByText("الأصناف")).toBeTruthy();
    expect(navigation.getByText("الحركات")).toBeTruthy();
    expect(navigation.getByText("التقارير")).toBeTruthy();
    expect(navigation.queryByText("الموردون والعملاء")).toBeNull();
    expect(navigation.queryByText("الفواتير")).toBeNull();
    expect(screen.queryByText("الموردون والعملاء")).toBeNull();
    expect(screen.queryByText("النسخ الاحتياطي")).toBeNull();
    expect(screen.queryByRole("button", { name: "إضافة صنف" })).toBeNull();
  });

  it("shows inventory creation controls only when the delegated role has inventory-management permission", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    render(<Home />);
    expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: true });
    expect(
      screen.getAllByRole("button", { name: "إضافة صنف" }).length
    ).toBeGreaterThan(0);
  });

  it("shows an explicit retry state when inventory data fails to load", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<Home />);
    expect(screen.getByText("تعذر تحميل بيانات المخزون حالياً.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy();
  });

  it("does not show an inventory failure on the accounting screen", () => {
    window.history.replaceState({}, "", "/?view=accounting");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["finance_manager"],
        permissions: ["accounting.read"],
      },
    });
    mocks.overview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    render(<Home />);
    expect(mocks.overview.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(mocks.history.mock.calls[0]?.[1]).toEqual({ enabled: false });
    expect(screen.queryByText("تعذر تحميل بيانات المخزون حالياً.")).toBeNull();
  });

  it("renders the professional inventory workspace with summary, search, filters, and low-stock cards", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "صنف اختباري",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: "أحمر",
                size: "M",
                barcode: "TEST-001",
                stockQuantity: 2,
              },
              {
                id: 12,
                color: "أحمر",
                size: "L",
                barcode: "TEST-002",
                stockQuantity: 1,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);
    expect(screen.getByText("كل الأصناف")).toBeTruthy();
    expect(screen.getByText("مركز المخزون", { exact: false })).toBeTruthy();
    expect(
      screen.getByPlaceholderText("ابحث بالاسم أو الباركود أو اللون أو المقاس…")
    ).toBeTruthy();
    expect(screen.getAllByText("مخزون منخفض").length).toBeGreaterThan(0);
    expect(screen.getByText("صنف اختباري")).toBeTruthy();
    expect(screen.getAllByTitle("إدخال مخزون").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("إخراج مخزون").length).toBeGreaterThan(0);
    expect(
      within(screen.getByRole("button", { name: /مخزون منخفض/ })).getByText("1")
    ).toBeTruthy();
  });

  it("renders the redesigned movement log with operational summaries", () => {
    window.history.replaceState({}, "", "/?view=movements");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.history.mockReturnValue({
      data: [
        {
          id: 21,
          type: "in",
          itemName: "صنف حركة",
          color: "أحمر",
          size: "M",
          barcode: "MOVE-001",
          quantity: 3,
          reason: "رصيد افتتاحي",
          createdAt: new Date(),
        },
      ],
      isLoading: false,
    });
    render(<Home />);
    expect(screen.getByText("سجل حركات المخزون")).toBeTruthy();
    expect(screen.getByText("سجل تشغيلي", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("صنف حركة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("رصيد افتتاحي").length).toBeGreaterThan(0);
  });

  it("shows filtered result count and clears item filters without leaving the inventory screen", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "صنف اختباري",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: "أحمر",
                size: "M",
                barcode: "TEST-001",
                stockQuantity: 2,
              },
            ],
          },
          {
            id: 2,
            name: "صنف ثانٍ",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 11,
                color: null,
                size: null,
                barcode: "TEST-002",
                stockQuantity: 12,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);

    const search = screen.getByPlaceholderText(
      "ابحث بالاسم أو الباركود أو اللون أو المقاس…"
    );
    fireEvent.change(search, { target: { value: "ثانٍ" } });
    expect(screen.getByText("عرض 1 من 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "مسح الفلاتر" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(screen.getByText("عرض 2 من 2")).toBeTruthy();
    fireEvent.change(search, { target: { value: "  أحمر  " } });
    fireEvent.submit(search.closest("form")!);
    expect((search as HTMLInputElement).value).toBe("أحمر");
    expect(screen.getByText("عرض 1 من 2")).toBeTruthy();
    expect(
      new URLSearchParams(window.location.search).get("inventorySearch")
    ).toBe("أحمر");
    fireEvent.change(search, { target: { value: "غير موجود" } });
    expect(screen.getByText("لا توجد أصناف مطابقة للبحث.")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "مسح الفلاتر" }).length
    ).toBeGreaterThan(0);
  });

  it("filters items by out-of-stock and available status", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "صنف نافد",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: null,
                size: null,
                barcode: "ZERO-001",
                stockQuantity: 0,
              },
            ],
          },
          {
            id: 2,
            name: "صنف متوفر",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 11,
                color: null,
                size: null,
                barcode: "AVAILABLE-001",
                stockQuantity: 12,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /بلا رصيد/ }));
    expect(screen.getByText("صنف نافد")).toBeTruthy();
    expect(screen.queryByText("صنف متوفر")).toBeNull();
    expect(
      new URLSearchParams(window.location.search).get("inventoryFilter")
    ).toBe("zero");

    fireEvent.click(screen.getByRole("button", { name: /متوفر/ }));
    expect(screen.getByText("صنف متوفر")).toBeTruthy();
    expect(screen.queryByText("صنف نافد")).toBeNull();
    expect(
      new URLSearchParams(window.location.search).get("inventoryFilter")
    ).toBe("available");
  });

  it("prioritizes the largest low-stock deficit in reports", () => {
    window.history.replaceState({}, "", "/?view=reports");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "أقل خطورة",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: null,
                size: null,
                barcode: "LOW-001",
                stockQuantity: 4,
              },
            ],
          },
          {
            id: 2,
            name: "عاجل جداً",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 11,
                color: null,
                size: null,
                barcode: "LOW-002",
                stockQuantity: 0,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);

    const content = document.body.textContent ?? "";
    expect(content.indexOf("عاجل جداً")).toBeLessThan(
      content.indexOf("أقل خطورة")
    );
  });

  it("switches the inventory workspace labels between Arabic and English", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);

    const languageSelect = screen.getByRole("combobox", { name: "اللغة" });
    fireEvent.change(languageSelect, { target: { value: "en" } });
    expect(screen.getByText("All items")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Search by item, barcode, colour, or size…")
    ).toBeTruthy();
  });

  it("formats larger inventory quantities for readable display", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "رصيد كبير",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: null,
                size: null,
                barcode: "LARGE-001",
                stockQuantity: 1234,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);

    fireEvent.change(screen.getByRole("combobox", { name: "اللغة" }), {
      target: { value: "en" },
    });
    expect(screen.getAllByText("1,234").length).toBeGreaterThan(0);
  });

  it("explains the next step when the inventory is empty", () => {
    window.history.replaceState({}, "", "/?view=items");
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue(emptyOverview);
    render(<Home />);
    expect(
      screen.getByText(
        "لا توجد أصناف مسجلة بعد. أضف أول صنف لبدء متابعة المخزون."
      )
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "إضافة صنف" }).length
    ).toBeGreaterThan(0);
  });

  it("restores inventory search and low-stock filters from the page URL", () => {
    window.history.replaceState(
      {},
      "",
      "/?view=items&inventorySearch=أحمر&inventoryFilter=low"
    );
    mocks.access.mockReturnValue({
      data: {
        canAccess: true,
        roles: ["custom_inventory_manager"],
        permissions: ["accounting.read", "inventory.manage"],
      },
    });
    mocks.overview.mockReturnValue({
      data: {
        items: [
          {
            id: 1,
            name: "صنف أحمر",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 10,
                color: "أحمر",
                size: "M",
                barcode: "TEST-001",
                stockQuantity: 2,
              },
            ],
          },
          {
            id: 2,
            name: "صنف أزرق",
            imageUrl: null,
            imageKey: null,
            lowStockThreshold: 5,
            variants: [
              {
                id: 11,
                color: "أزرق",
                size: "L",
                barcode: "TEST-002",
                stockQuantity: 12,
              },
            ],
          },
        ],
        recentMovements: [],
        settings: { defaultLowStockThreshold: 5 },
      },
      isLoading: false,
    });
    render(<Home />);
    expect(
      (
        screen.getByPlaceholderText(
          "ابحث بالاسم أو الباركود أو اللون أو المقاس…"
        ) as HTMLInputElement
      ).value
    ).toBe("أحمر");
    expect(screen.getByText("عرض 1 من 2")).toBeTruthy();
  });
});
