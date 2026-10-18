import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { AccountingWorkspace } from "@/components/AccountingWorkspace";
import { AccountingMovementsPanel } from "@/components/AccountingMovementsPanel";
import { InventoryWorkbookImporter } from "@/components/InventoryWorkbookImporter";
import { BackupManagement } from "@/components/BackupManagement";
import { InternalLoginForm } from "@/components/InternalLoginForm";
import { SectionGuide } from "@/components/SectionGuide";
import { getApplicationTitle } from "@/appIdentity";
import { getHomeViewAccess } from "@shared/homeAccess";
import {
  AnalyticsCharts,
  InvoiceManagement,
  MovementTrendChart,
  PartnerManagement,
  PartnerSearchResults,
} from "@/components/InventoryOperations";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useTheme } from "@/contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/dateTime";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Barcode,
  Building2,
  DatabaseBackup,
  Box,
  Boxes,
  CircleAlert,
  ClipboardList,
  Download,
  FileBarChart,
  Languages,
  Landmark,
  LayoutDashboard,
  Loader2,
  Moon,
  PackagePlus,
  Palette,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Undo2,
  Settings,
  Sun,
  UserRound,
  Warehouse,
  X,
} from "lucide-react";
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Language = "ar" | "en";
type View =
  | "dashboard"
  | "accounting"
  | "accountingMovements"
  | "items"
  | "partners"
  | "invoices"
  | "backups"
  | "movements"
  | "reports";

const copy = {
  ar: {
    appName: getApplicationTitle(),
    workspace: "الذهبي للمحاسبة",
    signIn: "تسجيل الدخول للمتابعة",
    secure: "مساحة عمل خاصة للمحاسبة والرواتب والمستندات والمخزون.",
    dashboard: "لوحة التحكم",
    items: "الأصناف",
    movements: "حركات المخزن",
    accountingMovements: "حركات المحاسبة",
    reports: "التقارير",
    partners: "الموردون والعملاء",
    invoices: "الفواتير",
    backups: "النسخ الاحتياطي",
    accounting: "المحاسبة والمالية",
    settings: "الإعدادات",
    overview: "نظرة عامة على المخزون",
    welcome: "متابعة عملية للأصناف والتنبيهات والحركات في مكان واحد.",
    addItem: "إضافة صنف",
    stockIn: "إدخال مخزون",
    stockOut: "إخراج مخزون",
    totalItems: "إجمالي الأصناف",
    totalVariants: "المتغيرات",
    totalQuantity: "الكمية المتاحة",
    lowStock: "تحتاج متابعة",
    recentMovements: "أحدث الحركات",
    allItems: "كل الأصناف",
    all: "الكل",
    search: "ابحث بالاسم أو الباركود أو اللون أو المقاس…",
    threshold: "حد التنبيه",
    defaultThreshold: "حد التنبيه الافتراضي",
    inherited: "الافتراضي العام",
    inStock: "متوفر",
    low: "مخزون منخفض",
    noStock: "بلا رصيد",
    available: "متوفر",
    variant: "المتغير",
    quantity: "الكمية",
    reason: "سبب الحركة",
    date: "التاريخ",
    type: "النوع",
    allMovementHistory: "سجل حركات المخزون",
    reportSummary: "ملخص التقرير",
    received: "المستلم",
    issued: "المُخرج",
    movementCount: "عدد الحركات",
    alertList: "أصناف تحت حد التنبيه",
    noAlerts: "لا توجد أصناف منخفضة حالياً.",
    newItem: "صنف جديد",
    itemName: "اسم الصنف",
    optionalThreshold: "حد خاص للصنف (اختياري)",
    useDefault: "اتركه فارغاً لاستخدام الحد الافتراضي",
    variants: "المتغيرات (لون، مقاس، باركود)",
    color: "اللون",
    size: "المقاس",
    barcode: "الباركود",
    opening: "الرصيد الافتتاحي",
    addVariant: "إضافة متغير",
    saveItem: "حفظ الصنف",
    cancel: "إلغاء",
    movementTitle: "تسجيل حركة مخزون",
    selected: "الصنف المحدد",
    movementType: "نوع الحركة",
    note: "ملاحظة أو اسم المستلم / العامل",
    movementNote: "ملاحظة / المستلم / العامل",
    saveMovement: "تسجيل الحركة",
    thresholdSettings: "إعدادات التنبيه",
    thresholdText: "يُستخدم هذا الحد لكل صنف لا يملك حد تنبيه خاصاً به.",
    saveSettings: "حفظ الإعدادات",
    noItems: "لا توجد أصناف مطابقة للبحث.",
    emptyItems: "لا توجد أصناف مسجلة بعد. أضف أول صنف لبدء متابعة المخزون.",
    noItemsHint: "جرّب كلمة بحث أخرى أو امسح الفلاتر لرؤية كل الأصناف.",
    emptyItemsHint:
      "يمكنك إضافة الاسم والصورة والمتغيرات وحد التنبيه من زر إضافة صنف.",
    user: "مستخدم",
    admin: "مدير النظام",
    photoLater: "يمكن إضافة صورة للصنف في تحديث لاحق.",
    imageUrl: "صورة الصنف (اختيارية)",
    imageHint:
      "اختر أي صورة؛ سيقوم البرنامج بتصغيرها وضغطها تلقائياً قبل الحفظ.",
    uploadImage: "رفع صورة من الجهاز",
    logout: "تسجيل الخروج",
    language: "اللغة",
    theme: "تبديل المظهر",
    refresh: "تحديث البيانات",
    clearFilters: "مسح الفلاتر",
    showing: "عرض",
    of: "من",
    loadError: "تعذر تحميل بيانات المخزون حالياً.",
    retry: "إعادة المحاولة",
  },
  en: {
    appName: "Aldhahabi Accounting",
    workspace: "Aldhahabi Accounting",
    signIn: "Sign in to continue",
    secure: "A private workspace for items and inventory movements.",
    dashboard: "Dashboard",
    items: "Items",
    movements: "Inventory movements",
    accountingMovements: "Accounting movements",
    reports: "Reports",
    partners: "Partners",
    invoices: "Invoices",
    backups: "Backups",
    accounting: "Accounting",
    settings: "Settings",
    overview: "Inventory overview",
    welcome: "A practical view of items, alerts, and movements in one place.",
    addItem: "Add item",
    stockIn: "Stock in",
    stockOut: "Stock out",
    totalItems: "Total items",
    totalVariants: "Variants",
    totalQuantity: "Available quantity",
    lowStock: "Needs attention",
    recentMovements: "Recent movements",
    allItems: "All items",
    all: "All",
    search: "Search by item, barcode, colour, or size…",
    threshold: "Alert threshold",
    defaultThreshold: "Default alert threshold",
    inherited: "Global default",
    inStock: "In stock",
    low: "Low stock",
    noStock: "Out of stock",
    available: "Available",
    variant: "Variant",
    quantity: "Quantity",
    reason: "Movement reason",
    date: "Date",
    type: "Type",
    allMovementHistory: "Inventory movement log",
    reportSummary: "Report summary",
    received: "Received",
    issued: "Issued",
    movementCount: "Movement count",
    alertList: "Items below alert threshold",
    noAlerts: "There are no low-stock items at the moment.",
    newItem: "New item",
    itemName: "Item name",
    optionalThreshold: "Custom item threshold (optional)",
    useDefault: "Leave blank to use the global default",
    variants: "Variants (colour, size, barcode)",
    color: "Colour",
    size: "Size",
    barcode: "Barcode",
    opening: "Opening quantity",
    addVariant: "Add variant",
    saveItem: "Save item",
    cancel: "Cancel",
    movementTitle: "Record stock movement",
    selected: "Selected item",
    movementType: "Movement type",
    note: "Note or recipient / worker name",
    movementNote: "Note / recipient / worker",
    saveMovement: "Record movement",
    thresholdSettings: "Alert settings",
    thresholdText:
      "This threshold applies to items without a custom threshold.",
    saveSettings: "Save settings",
    noItems: "No items match your search.",
    emptyItems:
      "No items have been added yet. Add the first item to start tracking stock.",
    noItemsHint:
      "Try another search term or clear the filters to see all items.",
    emptyItemsHint:
      "Add the name, image, variants, and alert threshold from the Add item button.",
    user: "User",
    admin: "System administrator",
    photoLater: "Item photos can be added in a later update.",
    imageUrl: "Item image (optional)",
    imageHint:
      "Choose any image; the program resizes and compresses it automatically before saving.",
    uploadImage: "Upload from device",
    logout: "Sign out",
    language: "Language",
    theme: "Toggle theme",
    refresh: "Refresh data",
    clearFilters: "Clear filters",
    showing: "Showing",
    of: "of",
    loadError: "Inventory data could not be loaded right now.",
    retry: "Retry",
  },
};

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card text-card-foreground shadow-2xl"
      >
        <div className="flex justify-end p-3">
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 pb-7 sm:px-8">{children}</div>
      </section>
    </div>
  );
}

const ITEM_IMAGE_MAX_DIMENSION = 1600;
const ITEM_IMAGE_TARGET_BYTES = 1_500_000;

async function compressItemImage(file: File): Promise<string> {
  const source =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(file)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("تعذر قراءة الصورة"));
          image.src = URL.createObjectURL(file);
        });
  const width =
    source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height =
    source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  const scale = Math.min(1, ITEM_IMAGE_MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();
  let quality = 0.84;
  let blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/webp", quality)
  );
  while (blob && blob.size > ITEM_IMAGE_TARGET_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", quality)
    );
  }
  if (!blob) throw new Error("تعذر تجهيز الصورة للرفع");
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذر تجهيز الصورة للرفع"));
    reader.readAsDataURL(blob);
  });
}

function ImageUrlPreview({
  value,
  label,
  hint,
  uploadLabel,
  onUploaded,
}: {
  value: string;
  label: string;
  hint: string;
  uploadLabel: string;
  onUploaded: (file: { url: string; key: string }) => void;
}) {
  const uploadImage = trpc.inventory.uploadImage.useMutation({
    onSuccess: onUploaded,
    onError: error => toast.error(error.message),
  });
  const [isCompressing, setIsCompressing] = useState(false);
  const handleFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("اختر ملف صورة صالحاً");
      return;
    }
    setIsCompressing(true);
    try {
      uploadImage.mutate({ dataUrl: await compressItemImage(file) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر ضغط الصورة");
    } finally {
      setIsCompressing(false);
    }
  };
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <Box className="h-6 w-6" />
          )}
        </div>
        <label className="grid min-w-0 flex-1 gap-1.5 text-xs font-bold">
          {label}
          <input
            type="file"
            accept="image/*"
            onChange={event => void handleFile(event.target.files?.[0])}
            className="block w-full text-xs font-normal file:me-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-800"
            disabled={uploadImage.isPending || isCompressing}
          />
          <span className="font-bold text-blue-700 dark:text-blue-300">
            {isCompressing
              ? "جارٍ تصغير الصورة…"
              : uploadImage.isPending
                ? "جارٍ الرفع…"
                : uploadLabel}
          </span>
          <span className="font-normal text-muted-foreground">{hint}</span>
        </label>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const utils = trpc.useUtils();
  const publicBranding = trpc.accounting.publicBranding.useQuery();
  const [language, setLanguage] = useState<Language>("ar");
  const [activeView, setActiveView] = useState<View>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "accounting" ||
      requested === "items" ||
      requested === "partners" ||
      requested === "invoices" ||
      requested === "backups" ||
      requested === "movements" ||
      requested === "reports"
      ? requested
      : "accounting";
  });
  const [search, setSearch] = useState(
    () =>
      new URLSearchParams(window.location.search).get("inventorySearch") ?? ""
  );
  const [itemFilter, setItemFilter] = useState<
    "all" | "low" | "zero" | "available"
  >(() => {
    const value = new URLSearchParams(window.location.search).get(
      "inventoryFilter"
    );
    return value === "low" || value === "zero" || value === "available"
      ? value
      : "all";
  });
  const hasItemFilters = Boolean(search.trim()) || itemFilter !== "all";
  const [isItemOpen, setIsItemOpen] = useState(
    () => new URLSearchParams(window.location.search).get("addItem") === "1"
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("addItem") === "1")
      setIsItemOpen(true);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (search.trim()) url.searchParams.set("inventorySearch", search);
    else url.searchParams.delete("inventorySearch");
    if (itemFilter !== "all")
      url.searchParams.set("inventoryFilter", itemFilter);
    else url.searchParams.delete("inventoryFilter");
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, [search, itemFilter]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    id: number;
    name: string;
    threshold: string;
    imageUrl: string;
    imageKey: string;
  } | null>(null);
  const [movementTarget, setMovementTarget] = useState<{
    id: number;
    label: string;
    stock: number;
  } | null>(null);
  const [newItem, setNewItem] = useState({
    name: "",
    threshold: "",
    imageUrl: "",
    imageKey: "",
    variants: [{ color: "", size: "", barcode: "", initialQuantity: "0" }],
  });
  const [movement, setMovement] = useState<{
    type: "in" | "out";
    quantity: string;
    reason: string;
    note: string;
  }>({
    type: "in",
    quantity: "1",
    reason: "",
    note: "",
  });
  const [settingsThreshold, setSettingsThreshold] = useState("5");
  const [reversalTarget, setReversalTarget] = useState<{
    id: number;
    label: string;
    quantity: number;
    type: "in" | "out";
  } | null>(null);
  const [reversalNote, setReversalNote] = useState("");
  const t = copy[language];
  const isRtl = language !== "en";
  const companyBrandName = publicBranding.data?.brandName?.trim() ?? "";
  const brandTitle = companyBrandName || t.appName;
  const brandSubtitle =
    companyBrandName && publicBranding.data?.showProductName ? t.workspace : "";
  const brandLogoUrl = publicBranding.data?.brandLogoUrl ?? null;
  const accountingAccess = trpc.accounting.access.useQuery(undefined, {
    enabled: Boolean(user),
  });
  const isAdmin = user?.role === "admin";
  const hasExplicitMenus = (accountingAccess.data?.permissions ?? []).some(
    permission => permission.startsWith("menu.")
  );
  const canAccessAccounting =
    isAdmin ||
    (hasExplicitMenus
      ? (accountingAccess.data?.permissions ?? []).includes("menu.accounting")
      : Boolean(accountingAccess.data?.canAccess));
  const homeAccess = getHomeViewAccess({
    isOwner: isAdmin,
    roles: accountingAccess.data?.roles ?? [],
    permissions: accountingAccess.data?.permissions ?? [],
    hasAccessRecord: Boolean(accountingAccess.data),
    canAccessAccounting,
    hasUser: Boolean(user),
    activeView,
  });
  const isInventoryView = [
    "dashboard",
    "items",
    "movements",
    "reports",
  ].includes(activeView);

  useEffect(() => {
    const canOpenAccountingMovements =
      activeView === "accountingMovements" &&
      homeAccess.sections.includes("accounting");
    if (
      accountingAccess.data &&
      homeAccess.sections.length &&
      !homeAccess.sections.includes(activeView) &&
      !canOpenAccountingMovements
    )
      setActiveView(homeAccess.sections[0]);
  }, [accountingAccess.data, activeView, homeAccess.sections.join(",")]);

  const overview = trpc.inventory.overview.useQuery(undefined, {
    enabled: homeAccess.canReadInventory && isInventoryView,
  });
  const history = trpc.inventory.history.useQuery(undefined, {
    enabled: homeAccess.canReadInventoryHistory && isInventoryView,
  });
  const addItem = trpc.inventory.addItem.useMutation({
    onSuccess: async () => {
      toast.success(
        language === "en" ? "Item saved successfully" : "تم حفظ الصنف بنجاح"
      );
      setIsItemOpen(false);
      setNewItem({
        name: "",
        threshold: "",
        imageUrl: "",
        imageKey: "",
        variants: [{ color: "", size: "", barcode: "", initialQuantity: "0" }],
      });
      await utils.inventory.overview.invalidate();
      await utils.inventory.history.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const recordMovement = trpc.inventory.recordMovement.useMutation({
    onSuccess: async () => {
      toast.success(
        language === "en" ? "Movement recorded" : "تم تسجيل الحركة"
      );
      setMovementTarget(null);
      setMovement({ type: "in", quantity: "1", reason: "", note: "" });
      await utils.inventory.overview.invalidate();
      await utils.inventory.history.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const reverseMovement = (
    trpc.inventory as typeof trpc.inventory & { reverseMovement?: any }
  ).reverseMovement?.useMutation?.({
    onSuccess: async () => {
      toast.success(language === "en" ? "Movement reversed" : "تم التراجع عن الحركة وتسجيل الملاحظة");
      setReversalTarget(null);
      setReversalNote("");
      await utils.inventory.overview.invalidate();
      await utils.inventory.history.invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  }) ?? { isPending: false, mutate: () => undefined };
  const updateSettings = trpc.inventory.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success(language === "en" ? "Settings saved" : "تم حفظ الإعدادات");
      setIsSettingsOpen(false);
      await utils.inventory.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateItem = trpc.inventory.updateItem.useMutation({
    onSuccess: async () => {
      toast.success(language === "en" ? "Item updated" : "تم تحديث الصنف");
      setEditingItem(null);
      await utils.inventory.overview.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (overview.data?.settings.defaultLowStockThreshold !== undefined) {
      setSettingsThreshold(
        String(overview.data.settings.defaultLowStockThreshold)
      );
    }
  }, [overview.data?.settings.defaultLowStockThreshold]);

  const items = overview.data?.items ?? [];
  const movements = overview.data?.recentMovements ?? [];
  const movementHistory = history.data ?? movements;
  const defaultThreshold =
    overview.data?.settings.defaultLowStockThreshold ?? 5;
  const allVariants = useMemo(
    () =>
      items.flatMap(item =>
        item.variants.map(variant => ({
          ...variant,
          itemName: item.name,
          threshold: item.lowStockThreshold ?? defaultThreshold,
        }))
      ),
    [items, defaultThreshold]
  );
  const totalQuantity = allVariants.reduce(
    (sum, variant) => sum + variant.stockQuantity,
    0
  );
  const lowVariants = allVariants
    .filter(variant => variant.stockQuantity < variant.threshold)
    .sort(
      (a, b) => a.stockQuantity - a.threshold - (b.stockQuantity - b.threshold)
    );
  const lowItems = items.filter(item => {
    const itemThreshold = item.lowStockThreshold ?? defaultThreshold;
    return item.variants.some(variant => variant.stockQuantity < itemThreshold);
  });
  const zeroItems = items.filter(item =>
    item.variants.some(variant => variant.stockQuantity <= 0)
  );
  const availableItems = items.filter(item =>
    item.variants.some(variant => variant.stockQuantity > 0)
  );
  const receivedTotal = movementHistory
    .filter(movementItem => movementItem.type === "in")
    .reduce((sum, movementItem) => sum + movementItem.quantity, 0);
  const issuedTotal = movementHistory
    .filter(movementItem => movementItem.type === "out")
    .reduce((sum, movementItem) => sum + movementItem.quantity, 0);
  const filteredItems = items.filter(item => {
    const value = search.toLowerCase();
    const matchesSearch =
      item.name.toLowerCase().includes(value) ||
      item.variants.some(variant =>
        [variant.barcode, variant.color, variant.size].some(part =>
          part?.toLowerCase().includes(value)
        )
      );
    const itemThreshold = item.lowStockThreshold ?? defaultThreshold;
    const matchesStatus =
      itemFilter === "all" ||
      (itemFilter === "low" &&
        item.variants.some(variant => variant.stockQuantity < itemThreshold)) ||
      (itemFilter === "zero" &&
        item.variants.some(variant => variant.stockQuantity <= 0)) ||
      (itemFilter === "available" &&
        item.variants.some(variant => variant.stockQuantity > 0));
    return matchesSearch && matchesStatus;
  });
  const clearItemFilters = () => {
    setSearch("");
    setItemFilter("all");
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(value => value.trim());
  };
  const refreshInventory = async () => {
    const [overviewResult, historyResult] = await Promise.all([
      overview.refetch(),
      history.refetch(),
    ]);
    if (overviewResult.isError || historyResult.isError) {
      toast.error(
        language === "en"
          ? "Inventory data could not be refreshed"
          : "تعذر تحديث بيانات المخزون"
      );
      return;
    }
    toast.success(
      language === "en" ? "Inventory data refreshed" : "تم تحديث بيانات المخزون"
    );
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <main
        className="grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_#dbeafe,transparent_42%),radial-gradient(circle_at_bottom_right,_#d1fae5,transparent_38%),linear-gradient(135deg,_#f8fafc,_#eef2ff)] p-5"
        dir="rtl"
      >
        <section className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-2xl shadow-slate-300/50 backdrop-blur lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative overflow-hidden bg-[#0d3158] p-8 text-white sm:p-10">
            <div className="absolute -left-20 -top-16 h-56 w-56 rounded-full bg-blue-400/20 blur-2xl" />
            <div className="absolute -bottom-24 -right-12 h-64 w-64 rounded-full bg-emerald-300/10 blur-2xl" />
            <div className="relative">
              <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white/15 shadow-lg">
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt=""
                    className="h-full w-full object-contain bg-white p-1"
                  />
                ) : (
                  <Warehouse className="h-7 w-7" />
                )}
              </div>
              <p className="mt-8 text-sm font-black tracking-wide text-blue-200">
                {brandTitle}
              </p>
              {brandSubtitle && (
                <p className="mt-1 text-xs font-bold text-blue-100">
                  {brandSubtitle}
                </p>
              )}
              <h1 className="mt-2 text-3xl font-black leading-tight">
                بوابة العمل اليومية
              </h1>
              <p className="mt-4 max-w-sm text-sm leading-7 text-blue-100/85">
                سجّل الدخول باسم المستخدم وكلمة المرور التي أنشأها لك المالك أو
                المدير المفوّض، ثم ستظهر لك الأقسام والإجراءات المسموح بها لدورك
                فقط.
              </p>
              <div className="mt-8 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs leading-6 text-blue-100">
                <p className="font-black text-white">دخول آمن لكل موظف</p>
                <p className="mt-1">
                  لا تُعرض كلمات المرور ولا تُشارك الحسابات بين الموظفين. عند
                  فقدانها، يطلب الموظف إعادة التعيين من المالك أو المدير
                  المخوّل.
                </p>
              </div>
            </div>
          </div>
          <div className="p-7 sm:p-10">
            <p className="text-sm font-black text-blue-700">تسجيل الدخول</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">
              أهلاً بك في {brandTitle}
            </h2>
            {brandSubtitle && (
              <p className="mt-1 text-xs font-bold text-blue-700">
                {brandSubtitle}
              </p>
            )}
            <p className="mt-2 text-sm leading-6 text-slate-500">
              استخدم بيانات الدخول الداخلية المرسلة لك. دخول المالك الخارجي متاح
              بشكل منفصل أدناه.
            </p>
            <div className="mt-7">
              <InternalLoginForm onOwnerLogin={() => startLogin()} />
            </div>
          </div>
        </section>
      </main>
    );
  }

  const canReadInventory = homeAccess.inventory;
  const canManageInventory = homeAccess.inventoryManage;
  const canManageCommerce = homeAccess.commerce;
  const canManageBackups = homeAccess.backups;
  const navigationCandidates: Array<{
    id: View;
    label: React.ReactNode;
    icon: typeof LayoutDashboard;
  }> = [
    ...(canAccessAccounting
      ? [{ id: "accounting" as View, label: t.accounting, icon: Landmark }]
      : []),
    { id: "dashboard", label: t.dashboard, icon: LayoutDashboard },
    ...(canReadInventory
      ? [{ id: "items" as View, label: t.items, icon: Boxes }]
      : []),
    ...(canManageCommerce
      ? [
          { id: "partners" as View, label: t.partners, icon: Building2 },
          { id: "invoices" as View, label: t.invoices, icon: ReceiptText },
        ]
      : []),
    ...(canManageBackups
      ? [{ id: "backups" as View, label: t.backups, icon: DatabaseBackup }]
      : []),
    ...(canReadInventory
      ? [
          { id: "movements" as View, label: <><span>{t.movements}</span><span className="sr-only">الحركات</span></>, icon: ClipboardList },
          ...(canAccessAccounting
            ? [{ id: "accountingMovements" as View, label: t.accountingMovements, icon: ClipboardList }]
            : []),
          { id: "reports" as View, label: t.reports, icon: FileBarChart },
        ]
      : []),
  ];
  const navigation = navigationCandidates.filter(
    item =>
      homeAccess.sections.includes(item.id) ||
      (item.id === "accountingMovements" &&
        homeAccess.sections.includes("accounting"))
  );
  const isDeepLinkBlocked = activeView !== "dashboard" && homeAccess.isBlocked;
  const isDashboardBlocked = activeView === "dashboard" && homeAccess.isBlocked;

  const setTarget = (
    variant: {
      id: number;
      color: string | null;
      size: string | null;
      barcode: string | null;
      stockQuantity: number;
    },
    itemName: string,
    type: "in" | "out"
  ) => {
    const descriptor = [variant.color, variant.size]
      .filter(Boolean)
      .join(" · ");
    setMovementTarget({
      id: variant.id,
      label: descriptor ? `${itemName} — ${descriptor}` : itemName,
      stock: variant.stockQuantity,
    });
    setMovement({ type, quantity: "1", reason: "", note: "" });
  };

  const variantLabel = (variant: {
    color: string | null;
    size: string | null;
    barcode: string | null;
  }) =>
    [variant.color, variant.size].filter(Boolean).join(" · ") ||
    variant.barcode ||
    "—";
  const formatQuantity = (value: number) =>
    new Intl.NumberFormat(language === "en" ? "en-US" : "ar-IQ-u-nu-latn", {
      maximumFractionDigits: 3,
    }).format(value);
  const formatDate = (value: Date | string) => formatDateTime(value, language === "en" ? "en" : "ar");
  const exportInventoryReport = () => {
    const escapeCsv = (value: string | number) =>
      `"${String(value).replaceAll('"', '""')}"`;
    const header = [
      t.items,
      t.variant,
      t.barcode,
      t.quantity,
      t.threshold,
      t.type,
    ];
    const rows = allVariants.map(variant => [
      variant.itemName,
      variantLabel(variant),
      variant.barcode ?? "",
      variant.stockQuantity,
      variant.threshold,
      variant.stockQuantity < variant.threshold ? t.low : t.inStock,
    ]);
    const csv =
      "\ufeff" +
      [header, ...rows].map(row => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderItemCard = (item: (typeof items)[number]) => {
    const itemThreshold = item.lowStockThreshold ?? defaultThreshold;
    const itemTotal = item.variants.reduce(
      (sum, variant) => sum + variant.stockQuantity,
      0
    );
    const hasLowVariant = item.variants.some(
      variant => variant.stockQuantity < itemThreshold
    );
    const stockRatio =
      itemThreshold > 0
        ? Math.min(
            100,
            Math.round(
              (itemTotal /
                (itemThreshold * Math.max(1, item.variants.length))) *
                100
            )
          )
        : 100;
    return (
      <article
        key={item.id}
        className={`group relative overflow-hidden rounded-[1.35rem] border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${hasLowVariant ? "border-red-200/80 dark:border-red-900/70" : "border-border/70"}`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-1 ${hasLowVariant ? "bg-red-500" : "bg-emerald-500"}`}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Box className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold">{item.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.lowStockThreshold === null
                  ? t.inherited
                  : `${t.threshold}: ${formatQuantity(itemThreshold)}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${hasLowVariant ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
            >
              {hasLowVariant ? t.low : t.inStock}
            </span>
            {canManageInventory && (
              <button
                title={t.settings}
                onClick={() =>
                  setEditingItem({
                    id: item.id,
                    name: item.name,
                    threshold:
                      item.lowStockThreshold === null
                        ? ""
                        : String(item.lowStockThreshold),
                    imageUrl: item.imageUrl ?? "",
                    imageKey: item.imageKey ?? "",
                  })
                }
                className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={t.settings}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 border-y border-border/60 py-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">
                {t.totalQuantity}
              </p>
              <p
                className={`mt-1 text-3xl font-black tabular-nums ${hasLowVariant ? "text-red-600 dark:text-red-400" : ""}`}
              >
                {formatQuantity(itemTotal)}
              </p>
            </div>
            <p className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
              {formatQuantity(item.variants.length)} {t.totalVariants}
            </p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${hasLowVariant ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${stockRatio}%` }}
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {item.variants.map(variant => {
            const isLow = variant.stockQuantity < itemThreshold;
            return (
              <div
                key={variant.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${isLow ? "bg-red-50/90 dark:bg-red-950/30" : "bg-muted/50"}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {variantLabel(variant)}
                  </p>
                  {variant.barcode && (
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                      {variant.barcode}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-black tabular-nums ${isLow ? "text-red-600 dark:text-red-400" : ""}`}
                  >
                    {formatQuantity(variant.stockQuantity)}
                  </span>
                  {canManageInventory && (
                    <>
                      <button
                        title={t.stockIn}
                        onClick={() => setTarget(variant, item.name, "in")}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-100 text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                        aria-label={t.stockIn}
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title={t.stockOut}
                        onClick={() => setTarget(variant, item.name, "out")}
                        className="grid h-7 w-7 place-items-center rounded-lg bg-amber-100 text-amber-700 transition hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-300"
                        aria-label={t.stockOut}
                      >
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    );
  };

  const metrics = [
    {
      label: t.totalItems,
      value: items.length,
      icon: Boxes,
      accent: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    },
    {
      label: t.totalVariants,
      value: allVariants.length,
      icon: Barcode,
      accent:
        "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
    },
    {
      label: t.totalQuantity,
      value: totalQuantity,
      icon: PackagePlus,
      accent:
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    },
    {
      label: t.lowStock,
      value: lowVariants.length,
      icon: CircleAlert,
      accent: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
    },
  ];

  return (
    <DashboardLayout
      navigation={navigation.map(item => ({
        key: item.id,
        label: item.label,
        icon: item.icon,
      }))}
      activeKey={activeView}
      onNavigate={key => setActiveView(key as View)}
      brandTitle={brandTitle}
      brandSubtitle={brandSubtitle}
      brandLogoUrl={brandLogoUrl}
      labels={{
        signIn: t.signIn,
        protectedInfo: t.secure,
        user: t.user,
        admin: t.admin,
        logout: t.logout,
      }}
      direction={isRtl ? "rtl" : "ltr"}
    >
      <div
        className="min-h-screen text-foreground"
        dir={isRtl ? "rtl" : "ltr"}
        lang={language === "en" ? "en" : "ar"}
      >
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-5 py-4 shadow-[0_8px_26px_rgba(15,38,70,0.04)] backdrop-blur-xl sm:px-8">
          <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">
              <div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-[#0d3158] text-white shadow-lg shadow-blue-950/15">
                {brandLogoUrl ? (
                  <img
                    src={brandLogoUrl}
                    alt=""
                    className="h-full w-full object-contain bg-white p-1"
                  />
                ) : (
                  <Warehouse className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-black">{brandTitle}</p>
                {brandSubtitle && (
                  <p className="truncate text-[10px] font-bold text-blue-700">
                    {brandSubtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="hidden lg:block">
              <p className="ops-kicker">
                {brandTitle}
                {brandSubtitle ? ` · ${brandSubtitle}` : ""} · مركز العمليات
              </p>
              <h1 className="mt-0.5 text-2xl font-black tracking-tight">
                {navigation.find(item => item.id === activeView)?.label}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {canReadInventory &&
                ["dashboard", "items", "movements", "reports"].includes(
                  activeView
                ) && (
                  <button
                    onClick={() => void refreshInventory()}
                    className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={t.refresh}
                  >
                    {overview.isFetching ? (
                      <Loader2 className="h-[18px] w-[18px] animate-spin" />
                    ) : (
                      <RefreshCw className="h-[18px] w-[18px]" />
                    )}
                  </button>
                )}
              <select
                value={language}
                onChange={event => setLanguage(event.target.value as Language)}
                aria-label={t.language}
                className="h-11 rounded-xl border border-border bg-card px-3 text-sm font-black outline-none transition focus:ring-2 focus:ring-blue-500"
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
              <button
                onClick={toggleTheme}
                className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={t.theme}
              >
                {theme === "dark" ? (
                  <Sun className="h-[18px] w-[18px]" />
                ) : (
                  <Moon className="h-[18px] w-[18px]" />
                )}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label={t.settings}
                >
                  <Settings className="h-[18px] w-[18px]" />
                </button>
              )}
              {canManageInventory && activeView !== "accounting" && (
                <Button
                  onClick={() => setIsItemOpen(true)}
                  className="hidden h-11 rounded-xl bg-[#0d54c5] px-5 text-sm font-black shadow-lg shadow-blue-700/20 hover:bg-[#0b469f] sm:flex"
                >
                  <Plus className="h-4 w-4" />
                  {t.addItem}
                </Button>
              )}
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto pb-0.5 lg:hidden">
            {navigation.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-black ${activeView === item.id ? "bg-[#0d54c5] text-white shadow-md shadow-blue-700/20" : "bg-muted text-muted-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <div className="mx-auto max-w-[90rem] p-5 sm:p-8 lg:p-10">
          {isDeepLinkBlocked || isDashboardBlocked ? (
            <section className="ops-card grid min-h-[38vh] place-items-center rounded-3xl p-8 text-center">
              <div>
                <p className="ops-kicker">وصول محمي</p>
                <h2 className="mt-2 text-2xl font-black">
                  هذا القسم غير متاح لدورك الحالي
                </h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  اطلب من المالك أو المدير المفوض منحك صلاحية القسم المطلوبة، ثم
                  عد إلى لوحة التحكم.
                </p>
                {isDeepLinkBlocked && (
                  <Button
                    onClick={() => setActiveView("dashboard")}
                    className="mt-5 bg-[#0d54c5] hover:bg-[#0b469f]"
                  >
                    العودة إلى لوحة التحكم
                  </Button>
                )}
              </div>
            </section>
          ) : isInventoryView && overview.isLoading ? (
            <div className="grid min-h-[50vh] place-items-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
            </div>
          ) : isInventoryView && overview.isError ? (
            <section className="ops-card grid min-h-[38vh] place-items-center rounded-3xl p-8 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <CircleAlert className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-2xl font-black">{t.loadError}</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  تحقق من الاتصال ثم حاول مرة أخرى. إذا استمرت المشكلة، راجع
                  مدير النظام.
                </p>
                <Button
                  onClick={() => void refreshInventory()}
                  className="mt-5 bg-[#0d54c5] hover:bg-[#0b469f]"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t.retry}
                </Button>
              </div>
            </section>
          ) : (
            <>
              <SectionGuide section={activeView} language={language} />
              {activeView === "dashboard" && (
                <>
                  <section className="ops-card mb-7 grid gap-5 rounded-[1.7rem] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <p className="ops-kicker">{t.overview} · رؤية مباشرة</p>
                      <h2 className="ops-title mt-2 max-w-3xl">{t.welcome}</h2>
                      <p className="mt-3 max-w-2xl text-base font-semibold text-muted-foreground">
                        راقب أرصدة الأصناف، الحركات الحرجة، والتنبيهات من مساحة
                        عمل واحدة وواضحة.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-blue-900 dark:bg-blue-950/35 dark:text-blue-100">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
                      </span>
                      <div>
                        <p className="text-xs font-black text-blue-600 dark:text-blue-300">
                          حالة النظام
                        </p>
                        <p className="text-sm font-black">
                          المخزون تحت المراقبة
                        </p>
                      </div>
                    </div>
                    {canManageInventory && (
                      <Button
                        onClick={() => setIsItemOpen(true)}
                        className="h-11 rounded-xl bg-[#0d54c5] text-sm font-black hover:bg-[#0b469f] sm:hidden"
                      >
                        <Plus className="h-4 w-4" />
                        {t.addItem}
                      </Button>
                    )}
                  </section>
                  <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {metrics.map(metric => {
                      const Icon = metric.icon;
                      return (
                        <article
                          key={metric.label}
                          className="ops-card relative overflow-hidden rounded-3xl p-5"
                        >
                          <div className="absolute inset-y-0 right-0 w-1.5 bg-gradient-to-b from-blue-500 to-blue-700" />
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-base font-bold text-muted-foreground">
                                {metric.label}
                              </p>
                              <p className="mt-3 text-4xl font-black tracking-tight tabular-nums">
                                {formatQuantity(metric.value)}
                              </p>
                            </div>
                            <div
                              className={`grid h-12 w-12 place-items-center rounded-2xl ${metric.accent}`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                  <section className="mt-7 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                    <article className="ops-card rounded-3xl p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="ops-kicker">سجل العمل</p>
                          <h3 className="mt-1 text-xl font-black">
                            {t.recentMovements}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t.allMovementHistory}
                          </p>
                        </div>
                        <button
                          onClick={() => setActiveView("movements")}
                          className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                        >
                          {t.movements}
                        </button>
                      </div>
                      <div className="mt-5 divide-y divide-border/70">
                        {movements.slice(0, 6).map(movementItem => (
                          <div
                            key={movementItem.id}
                            className="flex items-center justify-between gap-3 py-3.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${movementItem.type === "in" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}
                              >
                                {movementItem.type === "in" ? (
                                  <ArrowDownToLine className="h-4 w-4" />
                                ) : (
                                  <ArrowUpFromLine className="h-4 w-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-base font-black">
                                  {movementItem.itemName}
                                </p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {movementItem.reason}
                                </p>
                              </div>
                            </div>
                            <div className="text-end">
                              <p
                                className={`text-lg font-black tabular-nums ${movementItem.type === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                              >
                                {movementItem.type === "in" ? "+" : "−"}
                                {formatQuantity(movementItem.quantity)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(movementItem.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="ops-card rounded-3xl border-red-100 bg-[linear-gradient(145deg,#fff,#fff7f7)] p-6 dark:border-red-900/50 dark:bg-[linear-gradient(145deg,#251a21,#1d171c)]">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                          <CircleAlert className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-red-600 dark:text-red-300">
                            أولوية المتابعة
                          </p>
                          <h3 className="mt-0.5 text-xl font-black">
                            {t.alertList}
                          </h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {formatQuantity(lowVariants.length)} {t.lowStock}
                          </p>
                        </div>
                      </div>
                      <div className="mt-5 space-y-2">
                        {lowVariants.length === 0 ? (
                          <p className="rounded-xl bg-white/70 p-4 text-base text-muted-foreground dark:bg-card/50">
                            {t.noAlerts}
                          </p>
                        ) : (
                          lowVariants.slice(0, 5).map(variant => (
                            <div
                              key={variant.id}
                              className="flex items-center justify-between rounded-xl bg-white/80 px-3.5 py-3 dark:bg-card/60"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-base font-black">
                                  {variant.itemName}
                                </p>
                                <p className="text-sm text-red-600 dark:text-red-300">
                                  {variantLabel(variant)}
                                </p>
                              </div>
                              <span className="rounded-lg bg-red-100 px-2.5 py-1.5 text-base font-black text-red-700 dark:bg-red-950 dark:text-red-300">
                                {formatQuantity(variant.stockQuantity)}/
                                {formatQuantity(variant.threshold)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  </section>
                  <section className="mt-7">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h3 className="text-xl font-black">{t.allItems}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t.photoLater}
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveView("items")}
                        className="text-sm font-bold text-blue-700 hover:underline dark:text-blue-300"
                      >
                        {t.items}
                      </button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {items.slice(0, 3).map(renderItemCard)}
                    </div>
                  </section>
                  <AnalyticsCharts language={language} />
                  <MovementTrendChart language={language} />
                </>
              )}

              {activeView === "items" && (
                <>
                  <section className="relative mb-6 overflow-hidden rounded-[1.7rem] bg-[linear-gradient(135deg,#0b3157_0%,#0d54c5_70%,#1677d2_100%)] p-6 text-white shadow-xl shadow-blue-950/15 sm:p-8">
                    <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                      <div>
                        <p className="text-sm font-bold text-blue-100">
                          {t.workspace} · مركز المخزون
                        </p>
                        <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                          {t.allItems}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-7 text-blue-100">
                          تابع الأصناف والمتغيرات والكميات المنخفضة بسرعة، وسجّل
                          الإدخال والإخراج من نفس الشاشة.
                        </p>
                      </div>
                      {canManageInventory && (
                        <Button
                          onClick={() => setIsItemOpen(true)}
                          className="rounded-xl bg-white font-black text-[#0d54c5] shadow-lg hover:bg-blue-50"
                        >
                          <Plus className="h-4 w-4" />
                          {t.addItem}
                        </Button>
                      )}
                    </div>
                    <Boxes className="absolute -bottom-8 end-8 h-40 w-40 text-white/10" />
                  </section>
                  <section className="mb-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                      <p className="text-xs font-bold text-muted-foreground">
                        {t.totalItems}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums">
                        {formatQuantity(items.length)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        صنف مسجل
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                      <p className="text-xs font-bold text-muted-foreground">
                        {t.totalQuantity}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums">
                        {formatQuantity(totalQuantity)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        وحدة متاحة
                      </p>
                    </div>
                    <div className="rounded-2xl border border-red-200/80 bg-red-50/60 p-4 shadow-sm dark:border-red-900/60 dark:bg-red-950/20">
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">
                        {t.lowStock}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-red-700 dark:text-red-300">
                        {formatQuantity(lowVariants.length)}
                      </p>
                      <p className="mt-1 text-xs text-red-700/70 dark:text-red-300/70">
                        تحتاج متابعة الآن
                      </p>
                    </div>
                  </section>
                  {canManageInventory && <InventoryWorkbookImporter />}
                  <section className="mb-6 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
                    <form
                      onSubmit={submitSearch}
                      className="flex flex-col gap-3 lg:flex-row lg:items-center"
                    >
                      <div className="relative flex-1">
                        <Search
                          className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                          style={
                            isRtl ? { right: "0.9rem" } : { left: "0.9rem" }
                          }
                        />
                        <input
                          value={search}
                          onChange={event => setSearch(event.target.value)}
                          placeholder={t.search}
                          className={`h-12 w-full rounded-xl border border-border bg-background text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950 ${isRtl ? "pr-10 pl-4" : "pl-10 pr-4"}`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
                        <button
                          type="button"
                          onClick={() => setItemFilter("all")}
                          className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${itemFilter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                        >
                          {t.all}{" "}
                          <span className="ms-1 opacity-70">
                            {items.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemFilter("low")}
                          className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${itemFilter === "low" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "text-muted-foreground"}`}
                        >
                          {t.low}{" "}
                          <span className="ms-1 opacity-70">
                            {lowItems.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemFilter("zero")}
                          className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${itemFilter === "zero" ? "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100" : "text-muted-foreground"}`}
                        >
                          {t.noStock}{" "}
                          <span className="ms-1 opacity-70">
                            {zeroItems.length}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemFilter("available")}
                          className={`rounded-lg px-3 py-2.5 text-xs font-black transition ${itemFilter === "available" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "text-muted-foreground"}`}
                        >
                          {t.available}{" "}
                          <span className="ms-1 opacity-70">
                            {availableItems.length}
                          </span>
                        </button>
                      </div>
                    </form>
                    <div
                      className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-xs font-bold text-muted-foreground"
                      aria-live="polite"
                    >
                      <span>
                        {t.showing} {filteredItems.length} {t.of} {items.length}
                      </span>
                      {hasItemFilters && (
                        <button
                          onClick={clearItemFilters}
                          className="rounded-lg px-2.5 py-1.5 text-blue-700 transition hover:bg-blue-50 hover:underline dark:text-blue-300 dark:hover:bg-blue-950/40"
                        >
                          {t.clearFilters}
                        </button>
                      )}
                    </div>
                  </section>
                  {filteredItems.length === 0 ? (
                    <section className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        <Boxes className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-lg font-black">
                        {hasItemFilters ? t.noItems : t.emptyItems}
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                        {hasItemFilters ? t.noItemsHint : t.emptyItemsHint}
                      </p>
                      {hasItemFilters && (
                        <button
                          onClick={clearItemFilters}
                          className="mt-5 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-800"
                        >
                          {t.clearFilters}
                        </button>
                      )}
                      {!hasItemFilters && canManageInventory && (
                        <Button
                          onClick={() => setIsItemOpen(true)}
                          className="mt-5 rounded-xl bg-blue-700 hover:bg-blue-800"
                        >
                          <Plus className="h-4 w-4" />
                          {t.addItem}
                        </Button>
                      )}
                    </section>
                  ) : (
                    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                      {filteredItems.map(renderItemCard)}
                    </section>
                  )}
                </>
              )}

              {activeView === "accounting" && canAccessAccounting && (
                <AccountingWorkspace language={language} />
              )}
              {activeView === "accountingMovements" && canAccessAccounting && (
                <AccountingMovementsPanel language={language} />
              )}

              {activeView === "partners" && (
                <>
                  <PartnerManagement language={language} />
                  <PartnerSearchResults language={language} />
                </>
              )}
              {activeView === "invoices" && (
                <InvoiceManagement language={language} />
              )}
              {activeView === "backups" && canManageBackups && (
                <BackupManagement language={language} />
              )}

              {activeView === "movements" && (
                <>
                  <section className="relative mb-6 overflow-hidden rounded-[1.7rem] bg-[linear-gradient(135deg,#142f4b_0%,#0d54c5_100%)] p-6 text-white shadow-xl shadow-blue-950/15 sm:p-8">
                    <div className="relative z-10">
                      <p className="text-sm font-bold text-blue-100">
                        {t.workspace} · سجل تشغيلي
                      </p>
                      <h2 className="mt-2 text-3xl font-black tracking-tight">
                        {t.allMovementHistory}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-7 text-blue-100">
                        راجع كل إدخالات وإخراجات المخزون مع الصنف والسبب والكمية
                        والتاريخ.
                      </p>
                    </div>
                    <ClipboardList className="absolute -bottom-7 end-8 h-36 w-36 text-white/10" />
                  </section>
                  <section className="mb-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
                      <p className="text-xs font-bold text-muted-foreground">
                        {t.movementCount}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums">
                        {movementHistory.length}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        سجل حركة
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {t.received}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                        +{formatQuantity(receivedTotal)}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700/70 dark:text-emerald-300/70">
                        {movements.filter(item => item.type === "in").length}{" "}
                        حركة إدخال
                      </p>
                    </div>
                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/20">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                        {t.issued}
                      </p>
                      <p className="mt-1 text-2xl font-black tabular-nums text-amber-700 dark:text-amber-300">
                        −{formatQuantity(issuedTotal)}
                      </p>
                      <p className="mt-1 text-xs text-amber-700/70 dark:text-amber-300/70">
                        {movements.filter(item => item.type === "out").length}{" "}
                        حركة إخراج
                      </p>
                    </div>
                  </section>
                  <section className="overflow-hidden rounded-[1.35rem] border border-border/70 bg-card shadow-sm">
                    <div className="space-y-3 p-3 md:hidden">
                      {movementHistory.length === 0 ? (
                        <p className="p-10 text-center text-sm text-muted-foreground">
                          لا توجد حركات مسجلة بعد.
                        </p>
                      ) : (
                        movementHistory.map(movementItem => (
                          <article
                            key={`mobile-${movementItem.id}`}
                            className="rounded-2xl border border-border/70 bg-background p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <div
                                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${movementItem.type === "in" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}
                                >
                                  {movementItem.type === "in" ? (
                                    <ArrowDownToLine className="h-4 w-4" />
                                  ) : (
                                    <ArrowUpFromLine className="h-4 w-4" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-black">
                                    {movementItem.itemName}
                                  </p>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {variantLabel(movementItem)}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-black ${movementItem.type === "in" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}
                              >
                                {movementItem.type === "in"
                                  ? t.stockIn
                                  : t.stockOut}
                              </span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {t.reason}
                                </p>
                                <p className="mt-1 truncate font-semibold">
                                  {movementItem.reason}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {t.movementNote}
                                </p>
                                <p className="mt-1 truncate font-semibold">
                                  {movementItem.note || "—"}
                                </p>
                              </div>
                              <div className="text-end">
                                <p className="text-xs text-muted-foreground">
                                  {t.quantity}
                                </p>
                                <p
                                  className={`mt-1 font-black ${movementItem.type === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                                >
                                  {movementItem.type === "in" ? "+" : "−"}
                                  {formatQuantity(movementItem.quantity)}
                                </p>
                              </div>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">
                              {formatDate(movementItem.createdAt)}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 w-full rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setReversalTarget({
                                  id: movementItem.id,
                                  label: movementItem.itemName,
                                  quantity: movementItem.quantity,
                                  type: movementItem.type,
                                });
                                setReversalNote("");
                              }}
                            >
                              <Undo2 className="h-3.5 w-3.5" /> تراجع عن الحركة
                            </Button>
                          </article>
                        ))
                      )}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[660px] text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="p-4 text-start font-bold">
                              {t.type}
                            </th>
                            <th className="p-4 text-start font-bold">
                              {t.items}
                            </th>
                            <th className="p-4 text-start font-bold">
                              {t.reason}
                            </th>
                            <th className="p-4 text-start font-bold">
                              {t.movementNote}
                            </th>
                            <th className="p-4 text-start font-bold">
                              {t.quantity}
                            </th>
                            <th className="p-4 text-start font-bold">
                              {t.date}
                            </th>
                            <th className="p-4 text-start font-bold">الإجراء</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                          {movementHistory.length === 0 ? (
                            <tr>
                              <td
                                colSpan={7}
                                className="p-16 text-center text-muted-foreground"
                              >
                                لا توجد حركات مسجلة بعد.
                              </td>
                            </tr>
                          ) : (
                            movementHistory.map(movementItem => (
                              <tr
                                key={movementItem.id}
                                className="transition hover:bg-muted/30"
                              >
                                <td className="p-4">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${movementItem.type === "in" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"}`}
                                  >
                                    {movementItem.type === "in" ? (
                                      <ArrowDownToLine className="h-3.5 w-3.5" />
                                    ) : (
                                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                                    )}
                                    {movementItem.type === "in"
                                      ? t.stockIn
                                      : t.stockOut}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <p className="font-bold">
                                    {movementItem.itemName}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {variantLabel(movementItem)}
                                  </p>
                                </td>
                                <td className="p-4 text-muted-foreground">
                                  {movementItem.reason}
                                </td>
                                <td className="p-4 text-muted-foreground">
                                  {movementItem.note || "—"}
                                </td>
                                <td
                                  className={`p-4 font-black tabular-nums ${movementItem.type === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                                >
                                  {movementItem.type === "in" ? "+" : "−"}
                                  {movementItem.quantity}
                                </td>
                                <td className="p-4 text-muted-foreground">
                                  {formatDate(movementItem.createdAt)}
                                </td>
                                <td className="p-4">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      setReversalTarget({
                                        id: movementItem.id,
                                        label: movementItem.itemName,
                                        quantity: movementItem.quantity,
                                        type: movementItem.type,
                                      });
                                      setReversalNote("");
                                    }}
                                  >
                                    <Undo2 className="h-3.5 w-3.5" /> تراجع
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}

              {activeView === "reports" && (
                <>
                  <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                    <div>
                      <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                        {t.workspace}
                      </p>
                      <h2 className="mt-1 text-3xl font-black">
                        {t.reportSummary}
                      </h2>
                    </div>
                    <div className="flex gap-2 print:hidden">
                      <Button
                        onClick={exportInventoryReport}
                        variant="outline"
                        className="rounded-xl bg-card"
                      >
                        <Download className="h-4 w-4" />
                        CSV
                      </Button>
                      <Button
                        onClick={() => window.print()}
                        variant="outline"
                        className="rounded-xl bg-card"
                      >
                        <Printer className="h-4 w-4" />
                        {t.reports}
                      </Button>
                    </div>
                  </section>
                  <section className="grid gap-4 md:grid-cols-3">
                    <article className="rounded-3xl border border-border bg-card p-6">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {t.received}
                      </p>
                      <p className="mt-3 text-4xl font-black text-emerald-600 dark:text-emerald-400">
                        +{formatQuantity(receivedTotal)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.movementCount}:{" "}
                        {movements.filter(item => item.type === "in").length}
                      </p>
                    </article>
                    <article className="rounded-3xl border border-border bg-card p-6">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {t.issued}
                      </p>
                      <p className="mt-3 text-4xl font-black text-amber-600 dark:text-amber-400">
                        −{formatQuantity(issuedTotal)}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.movementCount}:{" "}
                        {movements.filter(item => item.type === "out").length}
                      </p>
                    </article>
                    <article className="rounded-3xl border border-red-100 bg-red-50/50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                        {t.lowStock}
                      </p>
                      <p className="mt-3 text-4xl font-black text-red-600 dark:text-red-400">
                        {lowVariants.length}
                      </p>
                      <p className="mt-2 text-xs text-red-700/75 dark:text-red-300/75">
                        {t.alertList}
                      </p>
                    </article>
                  </section>
                  <section className="mt-6 rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        <Languages className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-black">{t.alertList}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t.threshold}: {defaultThreshold}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {lowVariants.map(variant => (
                        <div
                          key={variant.id}
                          className="rounded-2xl bg-red-50 p-4 dark:bg-red-950/25"
                        >
                          <p className="font-bold">{variant.itemName}</p>
                          <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                            {variantLabel(variant)}
                          </p>
                          <p className="mt-3 font-black text-red-700 dark:text-red-300">
                            {formatQuantity(variant.stockQuantity)} /{" "}
                            {formatQuantity(variant.threshold)}
                          </p>
                        </div>
                      ))}
                      {lowVariants.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          {t.noAlerts}
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {isItemOpen && (
        <Modal onClose={() => setIsItemOpen(false)}>
          <h2 className="text-2xl font-black">{t.newItem}</h2>
          <form
            className="mt-6 space-y-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              addItem.mutate({
                name: newItem.name,
                lowStockThreshold:
                  newItem.threshold === "" ? null : Number(newItem.threshold),
                imageUrl: newItem.imageUrl || null,
                imageKey: newItem.imageKey || null,
                variants: newItem.variants.map(variant => ({
                  color: variant.color || null,
                  size: variant.size || null,
                  barcode: variant.barcode || null,
                  initialQuantity: Number(variant.initialQuantity || 0),
                })),
              });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold sm:col-span-2">
                {t.itemName}
                <input
                  required
                  value={newItem.name}
                  onChange={event =>
                    setNewItem({ ...newItem, name: event.target.value })
                  }
                  className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                {t.optionalThreshold}
                <input
                  min="0"
                  type="number"
                  value={newItem.threshold}
                  onChange={event =>
                    setNewItem({ ...newItem, threshold: event.target.value })
                  }
                  placeholder={t.useDefault}
                  className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <div className="rounded-xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
                {t.useDefault}
              </div>
            </div>
            <ImageUrlPreview
              value={newItem.imageUrl}
              onUploaded={({ url, key }) =>
                setNewItem({ ...newItem, imageUrl: url, imageKey: key })
              }
              label={t.imageUrl}
              hint={t.imageHint}
              uploadLabel={t.uploadImage}
            />
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-black">{t.variants}</p>
                <button
                  type="button"
                  onClick={() =>
                    setNewItem({
                      ...newItem,
                      variants: [
                        ...newItem.variants,
                        {
                          color: "",
                          size: "",
                          barcode: "",
                          initialQuantity: "0",
                        },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:underline dark:text-blue-300"
                >
                  <Plus className="h-4 w-4" />
                  {t.addVariant}
                </button>
              </div>
              <div className="space-y-3">
                {newItem.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-2xl border border-border bg-muted/25 p-3 sm:grid-cols-2"
                  >
                    <label className="grid gap-1.5 text-xs font-bold">
                      <span className="flex items-center gap-1">
                        <Palette className="h-3.5 w-3.5" />
                        {t.color}
                      </span>
                      <input
                        value={variant.color}
                        onChange={event =>
                          setNewItem({
                            ...newItem,
                            variants: newItem.variants.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, color: event.target.value }
                                : item
                            ),
                          })
                        }
                        className="h-10 rounded-lg border border-border bg-background px-3 font-normal"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-bold">
                      {t.size}
                      <input
                        value={variant.size}
                        onChange={event =>
                          setNewItem({
                            ...newItem,
                            variants: newItem.variants.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, size: event.target.value }
                                : item
                            ),
                          })
                        }
                        className="h-10 rounded-lg border border-border bg-background px-3 font-normal"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-bold">
                      {t.barcode}
                      <input
                        value={variant.barcode}
                        onChange={event =>
                          setNewItem({
                            ...newItem,
                            variants: newItem.variants.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, barcode: event.target.value }
                                : item
                            ),
                          })
                        }
                        className="h-10 rounded-lg border border-border bg-background px-3 font-normal"
                      />
                    </label>
                    <label className="grid gap-1.5 text-xs font-bold">
                      {t.opening}
                      <input
                        min="0"
                        type="number"
                        value={variant.initialQuantity}
                        onChange={event =>
                          setNewItem({
                            ...newItem,
                            variants: newItem.variants.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    initialQuantity: event.target.value,
                                  }
                                : item
                            ),
                          })
                        }
                        className="h-10 rounded-lg border border-border bg-background px-3 font-normal"
                      />
                    </label>
                    {newItem.variants.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewItem({
                            ...newItem,
                            variants: newItem.variants.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          })
                        }
                        className="justify-self-end text-xs font-bold text-red-600 hover:underline sm:col-span-2"
                      >
                        {t.cancel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsItemOpen(false)}
                className="rounded-xl"
              >
                {t.cancel}
              </Button>
              <Button
                disabled={addItem.isPending}
                type="submit"
                className="rounded-xl bg-blue-700 hover:bg-blue-800"
              >
                {addItem.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t.saveItem}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {editingItem && (
        <Modal onClose={() => setEditingItem(null)}>
          <h2 className="text-2xl font-black">{t.settings}</h2>
          <form
            className="mt-6 space-y-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              updateItem.mutate({
                id: editingItem.id,
                name: editingItem.name,
                lowStockThreshold:
                  editingItem.threshold === ""
                    ? null
                    : Number(editingItem.threshold),
                imageUrl: editingItem.imageUrl || null,
                imageKey: editingItem.imageKey || null,
              });
            }}
          >
            <label className="grid gap-2 text-sm font-bold">
              {t.itemName}
              <input
                required
                value={editingItem.name}
                onChange={event =>
                  setEditingItem({ ...editingItem, name: event.target.value })
                }
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              {t.optionalThreshold}
              <input
                min="0"
                type="number"
                value={editingItem.threshold}
                onChange={event =>
                  setEditingItem({
                    ...editingItem,
                    threshold: event.target.value,
                  })
                }
                placeholder={t.useDefault}
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <ImageUrlPreview
              value={editingItem.imageUrl}
              onUploaded={({ url, key }) =>
                setEditingItem({ ...editingItem, imageUrl: url, imageKey: key })
              }
              label={t.imageUrl}
              hint={t.imageHint}
              uploadLabel={t.uploadImage}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t.useDefault}
            </p>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingItem(null)}
                className="rounded-xl"
              >
                {t.cancel}
              </Button>
              <Button
                disabled={updateItem.isPending}
                type="submit"
                className="rounded-xl bg-blue-700 hover:bg-blue-800"
              >
                {updateItem.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t.saveSettings}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {movementTarget && (
        <Modal onClose={() => setMovementTarget(null)}>
          <h2 className="text-2xl font-black">{t.movementTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t.selected}:{" "}
            <strong className="text-foreground">{movementTarget.label}</strong>{" "}
            · {t.totalQuantity}: {movementTarget.stock}
          </p>
          <form
            className="mt-6 space-y-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              recordMovement.mutate({
                variantId: movementTarget.id,
                type: movement.type,
                quantity: Number(movement.quantity),
                reason: movement.reason,
                note: movement.note || null,
              });
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMovement({ ...movement, type: "in" })}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold ${movement.type === "in" ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "border-border"}`}
              >
                <ArrowDownToLine className="h-4 w-4" />
                {t.stockIn}
              </button>
              <button
                type="button"
                onClick={() => setMovement({ ...movement, type: "out" })}
                className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold ${movement.type === "out" ? "border-amber-600 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "border-border"}`}
              >
                <ArrowUpFromLine className="h-4 w-4" />
                {t.stockOut}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold">
                {t.quantity}
                <input
                  required
                  min="1"
                  type="number"
                  value={movement.quantity}
                  onChange={event =>
                    setMovement({ ...movement, quantity: event.target.value })
                  }
                  className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="grid gap-2 text-sm font-bold">
                {t.reason}
                <input
                  required
                  minLength={2}
                  value={movement.reason}
                  onChange={event =>
                    setMovement({ ...movement, reason: event.target.value })
                  }
                  className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
            <label className="grid gap-2 text-sm font-bold">
              {t.note}
              <textarea
                value={movement.note}
                onChange={event =>
                  setMovement({ ...movement, note: event.target.value })
                }
                className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovementTarget(null)}
                className="rounded-xl"
              >
                {t.cancel}
              </Button>
              <Button
                disabled={recordMovement.isPending}
                type="submit"
                className={`rounded-xl ${movement.type === "in" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-amber-700 hover:bg-amber-800"}`}
              >
                {recordMovement.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t.saveMovement}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {reversalTarget && (
        <Modal onClose={() => setReversalTarget(null)}>
          <h2 className="text-2xl font-black">تراجع عن حركة مخزن</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            سيتم تسجيل حركة عكسية للكمية {reversalTarget.quantity} للصنف
            <strong className="text-foreground"> {reversalTarget.label}</strong>.
            لا يتم حذف الحركة الأصلية.
          </p>
          <form
            className="mt-6 space-y-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              reverseMovement.mutate({
                movementId: reversalTarget.id,
                note: reversalNote,
              });
            }}
          >
            <label className="grid gap-2 text-sm font-bold">
              ملاحظة التراجع
              <textarea
                required
                minLength={2}
                maxLength={1000}
                value={reversalNote}
                onChange={event => setReversalNote(event.target.value)}
                placeholder="اكتب سبب التراجع بالتفصيل"
                className="min-h-28 rounded-xl border border-border bg-background p-3 font-normal outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReversalTarget(null)}
                className="rounded-xl"
              >
                {t.cancel}
              </Button>
              <Button
                type="submit"
                disabled={reverseMovement.isPending || reversalNote.trim().length < 2}
                className="rounded-xl bg-red-700 hover:bg-red-800"
              >
                {reverseMovement.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد التراجع
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {isSettingsOpen && (
        <Modal onClose={() => setIsSettingsOpen(false)}>
          <h2 className="text-2xl font-black">{t.thresholdSettings}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t.thresholdText}
          </p>
          <form
            className="mt-6"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              updateSettings.mutate({
                defaultLowStockThreshold: Number(settingsThreshold),
              });
            }}
          >
            <label className="grid gap-2 text-sm font-bold">
              {t.defaultThreshold}
              <input
                required
                min="0"
                type="number"
                value={settingsThreshold}
                onChange={event => setSettingsThreshold(event.target.value)}
                className="h-11 rounded-xl border border-border bg-background px-3 font-normal outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-xl"
              >
                {t.cancel}
              </Button>
              <Button
                disabled={updateSettings.isPending}
                type="submit"
                className="rounded-xl bg-blue-700 hover:bg-blue-800"
              >
                {updateSettings.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t.saveSettings}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </DashboardLayout>
  );
}
