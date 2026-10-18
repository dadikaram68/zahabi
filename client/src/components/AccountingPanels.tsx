import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/dateTime";
import {
  BarChart3,
  Building2,
  CalendarCheck2,
  CircleDollarSign,
  Calculator,
  Globe2,
  Landmark,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { PermissionBoard } from "@/components/PermissionBoard";
import {
  exportReportToExcel,
  printReportToPdf,
  type ReportSection,
} from "@/lib/reportExport";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function ManualTaxCalculator() {
  const documents = trpc.accounting.documents.useQuery();
  const [mode, setMode] = useState<"document" | "period">("period");
  const [ratePercent, setRatePercent] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [startDate, setStartDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const calculate = trpc.accounting.calculateManualTax.useMutation({
    onError: error => toast.error(error.message),
  });
  const money = (value: number, currency = "USD") =>
    new Intl.NumberFormat("ar-IQ", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: currency === "IQD" ? 0 : 2,
    }).format(value / 100);
  const eligibleDocuments = (documents.data ?? []).filter(
    document =>
      document.status === "posted" &&
      [
        "saleInvoice",
        "purchaseInvoice",
        "salesReturn",
        "purchaseReturn",
      ].includes(document.type)
  );
  const documentSourceBlocked =
    documents.isLoading || documents.isError || eligibleDocuments.length === 0;
  const documentControl = documents.isLoading ? (
    <div className="grid gap-1.5 text-sm font-bold">
      <span>الفاتورة المرحلة</span>
      <span className="flex h-11 items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 text-sm font-normal text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        جارٍ تحميل الفواتير المرحلة…
      </span>
    </div>
  ) : documents.isError ? (
    <div className="grid gap-1.5 text-sm font-bold">
      <span>الفاتورة المرحلة</span>
      <span
        role="alert"
        className="flex min-h-11 items-center rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-normal text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"
      >
        تعذر تحميل الفواتير؛ أعد المحاولة لاحقاً أو استخدم احتساب الفترة.
      </span>
    </div>
  ) : eligibleDocuments.length === 0 ? (
    <div className="grid gap-1.5 text-sm font-bold">
      <span>الفاتورة المرحلة</span>
      <span className="flex min-h-11 items-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        لا توجد فواتير أو مرتجعات مرحلة صالحة للاحتساب الفردي.
      </span>
    </div>
  ) : (
    <label className="grid gap-1.5 text-sm font-bold">
      الفاتورة المرحلة
      <select
        aria-label="الفاتورة للضريبة"
        value={documentId}
        onChange={event => setDocumentId(event.target.value)}
        className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
      >
        <option value="">اختر فاتورة</option>
        {eligibleDocuments.map(document => (
          <option key={document.id} value={document.id}>
            {document.documentNumber} · {document.type} ·{" "}
            {document.currencyCode}
          </option>
        ))}
      </select>
    </label>
  );
  const handleCalculate = () => {
    const rateBps = Math.round(Number(ratePercent) * 100);
    if (!Number.isFinite(rateBps) || rateBps < 0 || rateBps > 10_000)
      return toast.error("أدخل نسبة بين 0% و100%");
    if (mode === "document") {
      if (!documentId) return toast.error("اختر فاتورة مرحلة");
      calculate.mutate({ rateBps, documentId: Number(documentId) });
      return;
    }
    calculate.mutate({ rateBps, startDate, endDate });
  };
  const result = calculate.data;
  return (
    <article className="rounded-3xl border border-blue-200 bg-[linear-gradient(135deg,#f8fbff,#eff6ff)] p-5 shadow-sm dark:border-blue-950 dark:bg-[linear-gradient(135deg,#0b1931,#102647)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
            احتساب ضريبة عند الطلب
          </p>
          <h3 className="mt-1 text-xl font-black">
            فاتورة واحدة أو فترة يحددها المحاسب
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            هذه العملية لا تضيف ضريبة إلى أي فاتورة، ولا تعدل المستندات أو
            القيود. أدخل النسبة وقت الاحتساب وراجعها محاسبك وفق النظام المحلي
            قبل أي إقرار رسمي.
          </p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-700 text-white">
          <Calculator className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[auto_160px_1fr_auto] lg:items-end">
        <label className="grid gap-1.5 text-sm font-bold">
          طريقة الاحتساب
          <select
            value={mode}
            onChange={event =>
              setMode(event.target.value as "document" | "period")
            }
            className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
          >
            <option value="period">فترة محددة</option>
            <option value="document">فاتورة واحدة</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-bold">
          النسبة %
          <input
            aria-label="نسبة الضريبة"
            inputMode="decimal"
            value={ratePercent}
            onChange={event => setRatePercent(event.target.value)}
            placeholder="مثال: 10"
            className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
          />
        </label>
        {mode === "document" ? (
          documentControl
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm font-bold">
              من
              <input
                aria-label="بداية مدة الضريبة"
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              إلى
              <input
                aria-label="نهاية مدة الضريبة"
                type="date"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
          </div>
        )}
        <Button
          onClick={handleCalculate}
          disabled={
            calculate.isPending ||
            (mode === "document" && (documentSourceBlocked || !documentId))
          }
          className="h-11 rounded-xl bg-blue-700 font-black hover:bg-blue-800"
        >
          {calculate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          احتساب
        </Button>
      </div>
      {result && (
        <div className="mt-5 space-y-4 rounded-2xl border border-blue-100 bg-card p-4 dark:border-blue-950">
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="المستندات المشمولة"
              value={String(result.documentCount)}
            />
            <Metric
              label="ضريبة المخرجات (USD)"
              value={money(result.outputTaxUsdMinor)}
            />
            <Metric
              label="صافي الضريبة التشغيلي (USD)"
              value={money(result.netTaxPayableUsdMinor)}
            />
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[560px] text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">العملة</th>
                  <th className="p-2">صافي المبيعات</th>
                  <th className="p-2">مخرجات</th>
                  <th className="p-2">صافي المشتريات</th>
                  <th className="p-2">مدخلات</th>
                  <th className="p-2">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {result.currencySummaries.map(summary => (
                  <tr
                    key={summary.currencyCode}
                    className="border-t border-border"
                  >
                    <td className="p-2 font-bold">{summary.currencyCode}</td>
                    <td className="p-2">
                      {money(summary.salesNetMinor, summary.currencyCode)}
                    </td>
                    <td className="p-2">
                      {money(summary.outputTaxMinor, summary.currencyCode)}
                    </td>
                    <td className="p-2">
                      {money(summary.purchaseNetMinor, summary.currencyCode)}
                    </td>
                    <td className="p-2">
                      {money(summary.inputTaxMinor, summary.currencyCode)}
                    </td>
                    <td className="p-2 font-black">
                      {money(summary.netTaxMinor, summary.currencyCode)}
                    </td>
                  </tr>
                ))}
                {result.currencySummaries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-4 text-center text-muted-foreground"
                    >
                      لا توجد فواتير مرحلة مطابقة للنطاق المحدد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            سُجل طلب الاحتساب في سجل التدقيق. النتيجة تقدير تشغيلي وليست إقراراً
            أو ملفاً ضريبياً حكومياً.
          </p>
        </div>
      )}
    </article>
  );
}

function CompanyBrandingPanel() {
  const utils = trpc.useUtils();
  const access = trpc.accounting.access.useQuery();
  const canManageBranding =
    access.data?.roles?.includes("system_admin") ?? false;
  const config = trpc.accounting.configuration.useQuery(undefined, {
    enabled: canManageBranding,
  });
  const current = config.data?.companyBranding;
  const [draft, setDraft] = useState({
    brandName: "",
    brandLogoUrl: "",
    brandLogoKey: "",
    showProductName: true,
  });
  useEffect(() => {
    if (!current) return;
    setDraft({
      brandName: current.brandName ?? "",
      brandLogoUrl: current.brandLogoUrl ?? "",
      brandLogoKey: current.brandLogoKey ?? "",
      showProductName: current.showProductName,
    });
  }, [
    current?.brandName,
    current?.brandLogoUrl,
    current?.brandLogoKey,
    current?.showProductName,
  ]);
  const upload = trpc.accounting.uploadCompanyLogo.useMutation({
    onSuccess: result => {
      setDraft(value => ({
        ...value,
        brandLogoUrl: result.url,
        brandLogoKey: result.key,
      }));
      toast.success("تم رفع الشعار؛ احفظ الهوية لتطبيقه.");
    },
    onError: error => toast.error(error.message),
  });
  const save = trpc.accounting.updateCompanyBranding.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ هوية الشركة");
      await Promise.all([
        utils.accounting.configuration.invalidate(),
        utils.accounting.publicBranding.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  if (!canManageBranding) return null;
  const selectLogo = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return toast.error("اختر شعاراً بصيغة JPG أو PNG أو WEBP");
    if (file.size > 2 * 1024 * 1024)
      return toast.error("يجب ألا يزيد حجم الشعار على 2 ميغابايت");
    const reader = new FileReader();
    reader.onload = () => upload.mutate({ dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };
  return (
    <article className="rounded-3xl border border-blue-200 bg-[linear-gradient(135deg,#f8fbff,#eff6ff)] p-5 shadow-sm dark:border-blue-950 dark:bg-[linear-gradient(135deg,#0b1931,#102647)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
            هوية الشركة
          </p>
          <h3 className="mt-1 text-xl font-black">اسم وشعار الواجهة</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            يظهر اسم الشركة أولاً في بوابة الموظفين ورأس البرنامج. تستطيع إظهار
            اسم «الذهبي للمحاسبة» تحته أو إخفاءه. هذه الهوية تخص شركتك الحالية
            فقط.
          </p>
        </div>
        <Building2 className="h-6 w-6 text-blue-700" />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <label className="grid gap-1.5 text-sm font-bold">
          اسم الشركة الظاهر
          <input
            aria-label="اسم الشركة الظاهر"
            value={draft.brandName}
            onChange={event =>
              setDraft(value => ({ ...value, brandName: event.target.value }))
            }
            placeholder="مثال: شركة الإخلاص التجارية"
            className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold">
          شعار الشركة (اختياري)
          <input
            aria-label="شعار الشركة"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={event => selectLogo(event.target.files?.[0])}
            disabled={upload.isPending}
            className="block h-11 w-full rounded-xl border border-input bg-background px-3 pt-2 text-xs font-normal file:me-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-1 file:text-xs file:font-bold file:text-white"
          />
          <span className="text-xs font-normal text-muted-foreground">
            JPG أو PNG أو WEBP، حتى 2 ميغابايت.
          </span>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-card/80 p-4 dark:border-blue-950">
        <div className="flex min-w-0 items-center gap-3">
          {draft.brandLogoUrl ? (
            <img
              src={draft.brandLogoUrl}
              alt="معاينة شعار الشركة"
              className="h-12 w-12 rounded-xl border border-border bg-white object-contain p-1"
            />
          ) : (
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div>
            <p className="font-black">معاينة الهوية</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {draft.brandName.trim() || "اكتب اسم الشركة ليظهر هنا"}
            </p>
            {draft.showProductName && (
              <p className="mt-0.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                الذهبي للمحاسبة
              </p>
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm font-bold">
          <input
            aria-label="إظهار اسم الذهبي للمحاسبة"
            type="checkbox"
            checked={draft.showProductName}
            onChange={event =>
              setDraft(value => ({
                ...value,
                showProductName: event.target.checked,
              }))
            }
            className="h-4 w-4 accent-blue-700"
          />
          إظهار اسم الذهبي للمحاسبة تحت اسم الشركة
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={
            !draft.brandName.trim() || save.isPending || upload.isPending
          }
          onClick={() =>
            save.mutate({
              brandName: draft.brandName.trim(),
              brandLogoUrl: draft.brandLogoUrl || null,
              brandLogoKey: draft.brandLogoKey || null,
              showProductName: draft.showProductName,
            })
          }
          className="rounded-xl bg-blue-700 font-black hover:bg-blue-800"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ
          هوية الشركة
        </Button>
      </div>
    </article>
  );
}

function CountryProfilePanel() {
  const utils = trpc.useUtils();
  const access = trpc.accounting.access.useQuery();
  const canManage = access.data?.roles?.includes("system_admin") ?? false;
  const config = trpc.accounting.configuration.useQuery(undefined, {
    enabled: canManage,
  });
  const [countryCode, setCountryCode] = useState<"IQ" | "SY">("IQ");
  useEffect(() => {
    const value = config.data?.companyBranding?.countryCode;
    if (value === "IQ" || value === "SY") setCountryCode(value);
  }, [config.data?.companyBranding?.countryCode]);
  const save = trpc.accounting.updateCompanyCountry.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ ملف الدولة");
      await utils.accounting.configuration.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (!canManage) return null;
  const isIraq = countryCode === "IQ";
  return (
    <article className="rounded-3xl border border-amber-200 bg-[linear-gradient(135deg,#fffdf5,#fff7df)] p-5 shadow-sm dark:border-amber-950 dark:bg-[linear-gradient(135deg,#241d0b,#30240d)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            ملف المتطلبات
          </p>
          <h3 className="mt-1 text-xl font-black">اختيار الدولة المحاسبية</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            يحدد الأدمن الرئيسي البلد المستهدف للشركة. يمكنك تغييره لاحقاً؛ هذا
            الاختيار لا يضيف ضريبة تلقائية ولا يعتبر بديلاً عن مراجعة المتطلبات
            القانونية المحلية.
          </p>
        </div>
        <Globe2 className="h-6 w-6 text-amber-700" />
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1.5 text-sm font-bold">
          الدولة المستهدفة
          <select
            aria-label="الدولة المستهدفة"
            value={countryCode}
            onChange={event =>
              setCountryCode(event.target.value as "IQ" | "SY")
            }
            className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
          >
            <option value="IQ">العراق</option>
            <option value="SY">سوريا</option>
          </select>
        </label>
        <Button
          disabled={
            save.isPending ||
            countryCode === (config.data?.companyBranding?.countryCode ?? "IQ")
          }
          onClick={() => save.mutate({ countryCode })}
          className="h-11 rounded-xl bg-amber-700 font-black hover:bg-amber-800"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ
          ملف الدولة
        </Button>
      </div>
      <div className="mt-4 rounded-2xl border border-amber-200/80 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-black text-foreground">
          الملف الحالي: {isIraq ? "العراق" : "سوريا"}
        </p>
        <p className="mt-1">
          تبقى العملة الأساسية USD والضريبة يدوية عند الطلب. ستستخدم هذه القيمة
          كاختيار مركزي عند إضافة متطلبات البلد المحددة لاحقاً.
        </p>
      </div>
    </article>
  );
}

export function FinancialReportsPanel() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [reportTemplate, setReportTemplate] = useState("التقرير المالي");
  const [reportKind, setReportKind] = useState("all");
  const [accountSearch, setAccountSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dailySearch, setDailySearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSections, setPreviewSections] = useState<
    ReportSection[] | null
  >(null);
  const [movementItemId, setMovementItemId] = useState("");
  const [movementVariantId, setMovementVariantId] = useState("");
  const [visibleSections, setVisibleSections] = useState<
    Record<string, boolean>
  >({
    summary: true,
    trialBalance: true,
    aging: true,
    ledger: true,
    dailyGrouped: true,
    dailyDetails: true,
    itemMovement: true,
  });
  const [savedTemplates, setSavedTemplates] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("accounting-report-templates") ?? "[]"
      ) as string[];
    } catch {
      return [];
    }
  });
  const costCenters = trpc.accounting.costCenters.useQuery();
  const report = trpc.accounting.reports.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    costCenterId: costCenterId ? Number(costCenterId) : undefined,
  });
  const dailyEntries = trpc.accounting.dailyEntries.useQuery();
  const inventoryItems = trpc.inventory.items.useQuery(undefined, {
    enabled: reportKind === "itemMovement",
  });
  const movementReport = trpc.inventory.movementReport.useQuery(
    {
      itemId: movementItemId ? Number(movementItemId) : undefined,
      variantId: movementVariantId ? Number(movementVariantId) : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    },
    { enabled: reportKind === "itemMovement" }
  );
  const budgets = trpc.accounting.budgets.useQuery();
  const access = trpc.accounting.access.useQuery();
  const utils = trpc.useUtils();
  const [budgetDrafts, setBudgetDrafts] = useState<Record<number, string>>({});
  const saveBudget = trpc.accounting.upsertBudget.useMutation({
    onSuccess: () => {
      utils.accounting.budgets.invalidate();
      toast.success("تم حفظ بند الموازنة");
    },
    onError: error => toast.error(error.message),
  });
  const data = report.data;
  const money = (value: number) =>
    new Intl.NumberFormat("ar-IQ", {
      style: "currency",
      currency: data?.baseCurrencyCode ?? "USD",
      currencyDisplay: "code",
      maximumFractionDigits:
        (data?.baseCurrencyCode ?? "USD") === "IQD" ? 0 : 2,
    }).format(value);
  if (report.isLoading)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
      </div>
    );
  if (!data) return null;
  const moneyIn = (value: number, currency: string) =>
    `${new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: currency === "IQD" ? 0 : 2 }).format(value)} ${currency}`;
  const performance = data.performance ?? {
    revenue: 0,
    costOfSales: 0,
    grossProfit: 0,
    payrollExpense: 0,
    operatingExpenses: 0,
    operatingProfit: 0,
    grossMarginBps: null,
    operatingMarginBps: null,
  };
  const liquidity = data.liquidity ?? {
    currentAssets: 0,
    currentLiabilities: 0,
    netWorkingCapital: 0,
    currentRatioBps: null,
  };
  const ratio = (value: number | null) =>
    value === null
      ? "—"
      : `${(value / 100).toLocaleString("ar-IQ", { maximumFractionDigits: 2 })}%`;
  const filteredDailyEntries = (dailyEntries.data ?? []).filter(entry => {
    const date = new Date(entry.entryDate).toISOString().slice(0, 10);
    const searchable =
      `${entry.description} ${entry.category ?? ""} ${entry.voucherNumber ?? ""} ${entry.customerPartnerName ?? ""} ${entry.supplierPartnerName ?? ""}`.toLocaleLowerCase();
    return (
      (!startDate || date >= startDate) &&
      (!endDate || date <= endDate) &&
      (!dailySearch.trim() ||
        searchable.includes(dailySearch.trim().toLocaleLowerCase()))
    );
  });
  const groupedDailyReport = Array.from(
    filteredDailyEntries
      .reduce((groups, entry) => {
        const key = entry.description.trim().toLocaleLowerCase();
        const current = groups.get(key) ?? {
          description: entry.description.trim(),
          count: 0,
          usd: 0,
          iqd: 0,
          vouchers: new Set<string>(),
        };
        current.count += 1;
        if (entry.currencyCode === "USD") {
          const usd = Number(entry.amountMinor) / 100;
          current.usd += usd;
          current.iqd += usd * Number(entry.marketExchangeRate ?? 1570);
        } else {
          current.iqd += Number(entry.amountMinor);
          current.usd += Number(entry.baseAmountMinor ?? 0) / 100;
        }
        if (entry.voucherNumber) current.vouchers.add(entry.voucherNumber);
        groups.set(key, current);
        return groups;
      }, new Map<string, { description: string; count: number; usd: number; iqd: number; vouchers: Set<string> }>())
      .values()
  );
  const monthlyExpenseMap = new Map<
    string,
    { month: string; [item: string]: string | number }
  >();
  const itemTotals = new Map<string, number>();
  filteredDailyEntries
    .filter(
      entry => entry.entryType === "expense" || entry.entryType === "payment"
    )
    .forEach(entry => {
      const month = new Date(entry.entryDate).toISOString().slice(0, 7);
      const item = entry.description.trim() || "غير مصنف";
      const value = Number(entry.baseAmountMinor ?? entry.amountMinor) / 100;
      const row = monthlyExpenseMap.get(month) ?? { month };
      row[item] = Number(row[item] ?? 0) + value;
      monthlyExpenseMap.set(month, row);
      itemTotals.set(item, (itemTotals.get(item) ?? 0) + value);
    });
  const chartItems = Array.from(itemTotals.entries())
    .sort(([, first], [, second]) => second - first)
    .slice(0, 8)
    .map(([item]) => item);
  const monthlyExpenseChart = Array.from(monthlyExpenseMap.values()).sort(
    (first, second) => String(first.month).localeCompare(String(second.month))
  );
  const chartColors = [
    "#2563eb",
    "#7c3aed",
    "#059669",
    "#ea580c",
    "#dc2626",
    "#0891b2",
    "#ca8a04",
    "#db2777",
  ];
  const movementRows: ReportSection["rows"] = (movementReport.data ?? []).map(
    row => [
      formatDateTime(row.createdAt),
      row.itemName,
      row.variantLabel,
      row.direction,
      String(row.quantity),
      String(row.runningQuantity),
      money(Number(row.unitCostUsdMinor ?? 0) / 100),
      money(Number(row.totalValueUsdMinor ?? 0) / 100),
      row.supplierName || "—",
      row.costCenterName || "—",
      row.reason,
      row.performedByName || "—",
    ]
  );
  const cards: Array<{
    label: string;
    value: number;
    color: string;
    Icon: typeof BarChart3;
  }> = [
    {
      label: "إجمالي المدين",
      value: data.totals.totalDebits,
      color: "bg-blue-50 text-blue-700",
      Icon: CircleDollarSign,
    },
    {
      label: "إجمالي الدائن",
      value: data.totals.totalCredits,
      color: "bg-emerald-50 text-emerald-700",
      Icon: CircleDollarSign,
    },
    {
      label: "الإيرادات",
      value: data.incomeStatement.revenue,
      color: "bg-violet-50 text-violet-700",
      Icon: BarChart3,
    },
    {
      label: "صافي الربح",
      value: data.incomeStatement.netProfit,
      color: "bg-amber-50 text-amber-700",
      Icon: BarChart3,
    },
  ];
  const buildReportSections = (): ReportSection[] =>
    [
      {
        title: "الملخص المالي",
        columns: ["البند", "القيمة"],
        rows: [
          ["إجمالي المدين", money(data.totals.totalDebits)],
          ["إجمالي الدائن", money(data.totals.totalCredits)],
          ["الإيرادات", money(data.incomeStatement.revenue)],
          ["صافي الربح", money(data.incomeStatement.netProfit)],
          ["الربح التشغيلي", money(performance.operatingProfit)],
          ["صافي رأس المال العامل", money(liquidity.netWorkingCapital)],
        ],
      },
      {
        title: "ميزان المراجعة",
        columns: ["الرمز", "الحساب", "مدين", "دائن"],
        rows: data.trialBalance
          .filter(
            row =>
              !accountSearch ||
              `${row.code} ${row.name}`
                .toLowerCase()
                .includes(accountSearch.toLowerCase())
          )
          .filter(
            row =>
              !minAmount ||
              Number(row.debitMinor) + Number(row.creditMinor) >=
                Number(minAmount) * 100
          )
          .filter(
            row =>
              !maxAmount ||
              Number(row.debitMinor) + Number(row.creditMinor) <=
                Number(maxAmount) * 100
          )
          .map(row => [
            row.code,
            row.name,
            money(Number(row.debitMinor)),
            money(Number(row.creditMinor)),
          ]),
      },
      {
        title: "أعمار الذمم",
        columns: [
          "الطرف",
          "النوع",
          "الإجمالي",
          "حالي",
          "1–30",
          "31–60",
          "61–90",
          "90+",
        ],
        rows: data.aging.map(row => [
          row.partnerName,
          row.type,
          money(Number(row.totalMinor)),
          money(Number(row.currentMinor)),
          money(Number(row.days1To30Minor)),
          money(Number(row.days31To60Minor)),
          money(Number(row.days61To90Minor)),
          money(Number(row.daysOver90Minor)),
        ]),
      },
      {
        title: "الدفتر العام",
        columns: [
          "القيد",
          "التاريخ",
          "الحساب",
          "العملة",
          "القيمة الأصلية",
          "مدين USD",
          "دائن USD",
        ],
        rows: data.generalLedger
          .filter(
            row =>
              !accountSearch ||
              `${row.accountCode} ${row.accountName}`
                .toLowerCase()
                .includes(accountSearch.toLowerCase())
          )
          .filter(
            row =>
              !minAmount ||
              Number(row.debitMinor) + Number(row.creditMinor) >=
                Number(minAmount) * 100
          )
          .filter(
            row =>
              !maxAmount ||
              Number(row.debitMinor) + Number(row.creditMinor) <=
                Number(maxAmount) * 100
          )
          .map(row => [
            row.entryNumber,
            formatDateTime(row.createdAt),
            `${row.accountCode} — ${row.accountName}`,
            row.currencyCode,
            moneyIn(
              (Number(row.originalDebitMinor) || 0) /
                (row.currencyCode === "USD" ? 100 : 1),
              row.currencyCode
            ),
            money(Number(row.debitMinor)),
            money(Number(row.creditMinor)),
          ]),
      },
      {
        title: "تجميع الإدخالات اليومية",
        columns: [
          "البيان",
          "عدد العمليات",
          "إجمالي USD",
          "إجمالي IQD",
          "أرقام الوصولات",
        ],
        rows: groupedDailyReport.map(row => [
          row.description,
          String(row.count),
          moneyIn(row.usd / 100, "USD"),
          moneyIn(row.iqd, "IQD"),
          Array.from(row.vouchers).join("، ") || "—",
        ]),
      },
      {
        title: "تفاصيل الإدخالات والوصولات",
        columns: [
          "التاريخ",
          "رقم الوصل",
          "الفئة",
          "البيان",
          "النوع",
          "القيمة الأصلية",
          "USD",
          "IQD",
          "سعر الصرف",
          "المدين",
          "الدائن",
          "العميل",
          "المورد",
          "المستخدم",
        ],
        rows: filteredDailyEntries.map(entry => [
          formatDateTime(entry.createdAt),
          entry.voucherNumber ?? "—",
          entry.category ?? "—",
          entry.description,
          entry.entryType,
          moneyIn(
            Number(entry.amountMinor) /
              (entry.currencyCode === "USD" ? 100 : 1),
            entry.currencyCode
          ),
          moneyIn(Number(entry.baseAmountMinor) / 100, "USD"),
          moneyIn(
            entry.currencyCode === "IQD"
              ? Number(entry.amountMinor)
              : (Number(entry.baseAmountMinor) / 100) *
                  Number(entry.marketExchangeRate ?? 1570),
            "IQD"
          ),
          entry.currencyCode === "USD"
            ? "1"
            : String(entry.marketExchangeRate ?? "—"),
          `${entry.debitAccountCode} — ${entry.debitAccountName}`,
          `${entry.creditAccountCode} — ${entry.creditAccountName}`,
          entry.customerPartnerName ?? "—",
          entry.supplierPartnerName ?? "—",
          entry.createdByName ?? "—",
        ]),
      },
      {
        title: "تقرير حركة الصنف التفصيلي",
        columns: [
          "التاريخ",
          "الصنف",
          "المتغير",
          "الحركة",
          "الكمية",
          "الرصيد بعد الحركة",
          "قيمة الوحدة USD",
          "القيمة الإجمالية USD",
          "المورد",
          "مركز التكلفة",
          "السبب",
          "المنفذ",
        ],
        rows: movementRows,
      },
    ].filter((_, index) => {
      const key = [
        "summary",
        "trialBalance",
        "aging",
        "ledger",
        "dailyGrouped",
        "dailyDetails",
        "itemMovement",
      ][index];
      return (
        Boolean(visibleSections[key]) &&
        (reportKind === key || (reportKind === "all" && key !== "itemMovement"))
      );
    });
  const openPreview = () => {
    setPreviewSections(buildReportSections());
    setPreviewOpen(true);
  };
  const updatePreviewCell = (
    sectionIndex: number,
    rowIndex: number,
    columnIndex: number,
    value: string
  ) => {
    setPreviewSections(current => {
      const next = (current ?? buildReportSections()).map(section => ({
        ...section,
        rows: section.rows.map(row => [...row]),
      }));
      const section = next[sectionIndex];
      if (section?.rows[rowIndex]) section.rows[rowIndex][columnIndex] = value;
      return next;
    });
  };
  const setPreset = (preset: "today" | "week" | "month" | "all") => {
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
      setReportTemplate("التقرير المالي الشامل");
      return;
    }
    const end = new Date();
    const start = new Date(end);
    if (preset === "today") start.setDate(end.getDate());
    if (preset === "week") start.setDate(end.getDate() - 6);
    if (preset === "month") start.setDate(1);
    setReportTemplate(
      preset === "today"
        ? "التقرير اليومي"
        : preset === "week"
          ? "التقرير الأسبوعي"
          : "التقرير الشهري"
    );
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  };
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-bold text-blue-700">التقارير المالية</p>
        <h2 className="mt-1 text-3xl font-black">الميزان والأداء والذمم</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          تعتمد الأرقام على القيود المرحلة ضمن العملة الأساس: الدولار الأمريكي
          (USD).
        </p>
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-950 dark:bg-blue-950/20">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black">فلترة التقرير</span>
            {(["today", "week", "month", "all"] as const).map(preset => (
              <Button
                key={preset}
                size="sm"
                variant="outline"
                onClick={() => setPreset(preset)}
                className="bg-background"
              >
                {preset === "today"
                  ? "اليوم"
                  : preset === "week"
                    ? "آخر 7 أيام"
                    : preset === "month"
                      ? "هذا الشهر"
                      : "كل الفترات"}
              </Button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-bold">
              من
              <input
                type="date"
                value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              إلى
              <input
                type="date"
                value={endDate}
                onChange={event => setEndDate(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              مركز التكلفة
              <select
                value={costCenterId}
                onChange={event => setCostCenterId(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              >
                <option value="">كل المراكز</option>
                {(costCenters.data ?? []).map(center => (
                  <option key={center.id} value={center.id}>
                    {center.code} — {center.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-xs font-bold">
              نوع التقرير
              <select
                value={reportKind}
                onChange={event => setReportKind(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              >
                <option value="all">مركز موحد — كل الأقسام</option>
                <option value="summary">الملخص المالي</option>
                <option value="trialBalance">ميزان المراجعة</option>
                <option value="aging">أعمار الذمم</option>
                <option value="ledger">دفتر الأستاذ</option>
                <option value="dailyGrouped">تجميع الإدخالات اليومية</option>
                <option value="dailyDetails">تفاصيل الوصولات والإدخالات</option>
                <option value="itemMovement">حركة صنف تفصيلية</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold">
              بحث بالحساب
              <input
                value={accountSearch}
                onChange={event => setAccountSearch(event.target.value)}
                placeholder="الرمز أو الاسم"
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              بحث بالبيان أو رقم الوصل
              <input
                value={dailySearch}
                onChange={event => setDailySearch(event.target.value)}
                placeholder="مثال: صمون أو رقم وصل"
                className="h-10 rounded-xl border border-blue-300 bg-background px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              المبلغ من
              <input
                inputMode="decimal"
                value={minAmount}
                onChange={event => setMinAmount(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              />
            </label>
            <label className="grid gap-1 text-xs font-bold">
              المبلغ إلى
              <input
                inputMode="decimal"
                value={maxAmount}
                onChange={event => setMaxAmount(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
              />
            </label>
          </div>
          {reportKind === "itemMovement" && (
            <div className="mt-3 grid gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 md:grid-cols-2 dark:border-emerald-950 dark:bg-emerald-950/20">
              <label className="grid gap-1 text-xs font-bold">
                الصنف
                <select
                  value={movementItemId}
                  onChange={event => {
                    setMovementItemId(event.target.value);
                    setMovementVariantId("");
                  }}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
                >
                  <option value="">كل الأصناف</option>
                  {(inventoryItems.data ?? []).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold">
                المتغير / اللون / القياس
                <select
                  value={movementVariantId}
                  onChange={event => setMovementVariantId(event.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-normal"
                >
                  <option value="">كل المتغيرات</option>
                  {(inventoryItems.data ?? [])
                    .filter(
                      item =>
                        !movementItemId || String(item.id) === movementItemId
                    )
                    .flatMap(item =>
                      item.variants.map(variant => (
                        <option key={variant.id} value={variant.id}>
                          {item.name} —{" "}
                          {[variant.color, variant.size]
                            .filter(Boolean)
                            .join(" / ") || "الأساسي"}
                        </option>
                      ))
                    )}
                </select>
              </label>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold">
            <span>الأقسام الظاهرة:</span>
            {(
              [
                ["summary", "الملخص"],
                ["trialBalance", "الميزان"],
                ["aging", "الذمم"],
                ["ledger", "الأستاذ"],
                ["dailyGrouped", "تجميع اليوميات"],
                ["dailyDetails", "تفاصيل الوصولات"],
                ["itemMovement", "حركة الصنف"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={visibleSections[key]}
                  onChange={event =>
                    setVisibleSections(current => ({
                      ...current,
                      [key]: event.target.checked,
                    }))
                  }
                />
                {label}
              </label>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const name = reportTemplate.trim();
                if (!name) return toast.error("اكتب اسم القالب أولاً");
                const next = Array.from(new Set([...savedTemplates, name]));
                setSavedTemplates(next);
                localStorage.setItem(
                  "accounting-report-templates",
                  JSON.stringify(next)
                );
                toast.success("تم حفظ قالب التقرير");
              }}
            >
              حفظ القالب
            </Button>
            {savedTemplates.length > 0 && (
              <select
                value=""
                onChange={event => setReportTemplate(event.target.value)}
                className="h-8 rounded-lg border border-input bg-background px-2 font-normal"
              >
                <option value="">القوالب المحفوظة</option>
                {savedTemplates.map(template => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold">اسم التقرير عند التصدير</label>
            <input
              value={reportTemplate}
              onChange={event => setReportTemplate(event.target.value)}
              className="h-9 min-w-64 rounded-lg border border-input bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              يظهر الاسم نفسه في ملف Excel ونافذة PDF.
            </span>
          </div>
          {(startDate || endDate || costCenterId) && (
            <p className="mt-2 text-xs text-blue-800 dark:text-blue-200">
              يعرض التقرير الآن القيود المرحلة المطابقة للفلاتر المختارة، ويُطبق
              التصدير على النتيجة نفسها.
            </p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={openPreview}
            className="bg-blue-700 font-black hover:bg-blue-800"
          >
            معاينة وتعديل قبل التصدير
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportReportToExcel(
                reportTemplate.replace(/\s+/g, "-") || "تقرير-مالي",
                reportTemplate || "التقرير المالي",
                buildReportSections()
              )
            }
          >
            تصدير Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (
                !printReportToPdf(
                  reportTemplate || "التقرير المالي",
                  buildReportSections()
                )
              )
                toast.error("اسمح بفتح نافذة التقرير لإكمال تصدير PDF");
            }}
          >
            تصدير PDF
          </Button>
        </div>
      </header>
      {previewOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="معاينة التقرير"
        >
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-background shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <p className="text-sm font-bold text-blue-700">
                  معاينة قابلة للمراجعة
                </p>
                <h3 className="text-2xl font-black">
                  {reportTemplate || "التقرير المالي"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  غيّر الفلاتر أو الأقسام الظاهرة من الشاشة خلف النافذة ثم أعد
                  المعاينة قبل التصدير.
                </p>
              </div>
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                إغلاق
              </Button>
            </div>
            <div className="max-h-[calc(92vh-150px)] space-y-5 overflow-auto p-5">
              {(previewSections ?? buildReportSections()).map(
                (section, sectionIndex) => (
                  <section
                    key={section.title}
                    className="overflow-hidden rounded-2xl border border-border"
                  >
                    <h4 className="border-b border-border bg-muted/50 p-3 font-black">
                      {section.title}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        ({section.rows.length} صف)
                      </span>
                    </h4>
                    <div className="overflow-auto">
                      <table className="w-full min-w-[680px] text-right text-xs">
                        <thead className="bg-muted/30">
                          <tr>
                            {section.columns.map(column => (
                              <th key={column} className="p-2 font-black">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.slice(0, 100).map((row, rowIndex) => (
                            <tr
                              key={`${section.title}-${rowIndex}`}
                              className="border-t border-border"
                            >
                              {section.columns.map((_, columnIndex) => (
                                <td
                                  key={`${rowIndex}-${columnIndex}`}
                                  className="p-1"
                                >
                                  <input
                                    aria-label={`${section.title} ${rowIndex + 1} ${columnIndex + 1}`}
                                    value={String(row[columnIndex] ?? "")}
                                    onChange={event =>
                                      updatePreviewCell(
                                        sectionIndex,
                                        rowIndex,
                                        columnIndex,
                                        event.target.value
                                      )
                                    }
                                    className="h-8 w-full min-w-24 rounded-lg border border-transparent bg-transparent px-2 outline-none transition focus:border-blue-400 focus:bg-background"
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {section.rows.length > 100 && (
                        <p className="p-3 text-xs text-muted-foreground">
                          تظهر أول 100 صف في المعاينة، وسيتم تصدير جميع الصفوف.
                        </p>
                      )}
                    </div>
                  </section>
                )
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={() =>
                    exportReportToExcel(
                      reportTemplate.replace(/\s+/g, "-") || "تقرير-مالي",
                      reportTemplate || "التقرير المالي",
                      previewSections ?? buildReportSections()
                    )
                  }
                >
                  تصدير Excel
                </Button>
                <Button
                  onClick={() => {
                    if (
                      !printReportToPdf(
                        reportTemplate || "التقرير المالي",
                        previewSections ?? buildReportSections()
                      )
                    )
                      toast.error("اسمح بفتح نافذة التقرير لإكمال تصدير PDF");
                  }}
                >
                  تصدير PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <section className="grid gap-4 md:grid-cols-4">
        {cards.map(card => (
          <article
            key={card.label}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div
              className={`grid h-10 w-10 place-items-center rounded-xl ${card.color}`}
            >
              <card.Icon className="h-5 w-5" />
            </div>
            <p className="mt-4 text-xl font-black">{money(card.value)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </article>
        ))}
      </section>
      <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-blue-700">تحليل المصروفات</p>
            <h3 className="mt-1 text-xl font-black">
              المصروفات الشهرية لكل صنف
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              يعتمد الرسم على نتائج البحث والفترة الحالية، ويعرض أعلى 8 أصناف
              حسب القيمة الأساسية بالدولار. مرّر المؤشر فوق الأعمدة أو أخفِ أي
              صنف من وسيلة الإيضاح.
            </p>
          </div>
          <BarChart3 className="h-6 w-6 text-blue-700" />
        </div>
        {monthlyExpenseChart.length > 0 && chartItems.length > 0 ? (
          <div className="mt-5 h-[360px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyExpenseChart}
                margin={{ top: 12, right: 18, left: 8, bottom: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/60"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  tickFormatter={value => String(value).replace("-", "/")}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={value =>
                    Number(value).toLocaleString("en-US", {
                      maximumFractionDigits: 0,
                    })
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} USD`,
                    name,
                  ]}
                  labelFormatter={label => `الشهر: ${label}`}
                  contentStyle={{
                    direction: "rtl",
                    borderRadius: 12,
                    borderColor: "hsl(var(--border))",
                  }}
                />
                <Legend wrapperStyle={{ direction: "rtl", paddingTop: 12 }} />
                {chartItems.map((item, index) => (
                  <Bar
                    key={item}
                    dataKey={item}
                    name={item}
                    fill={chartColors[index % chartColors.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="mt-5 grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
            لا توجد مصروفات مطابقة للبحث أو الفترة المحددة.
          </div>
        )}
      </article>
      <ManualTaxCalculator />
      <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-sm font-bold text-violet-700">خطة الميزانية</p>
            <h3 className="mt-1 text-xl font-black">
              الخطة مقابل التنفيذ السنوي
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              الفترة: {budgets.data?.fiscalPeriodName ?? "—"}. التنفيذ من القيود
              المرحلة فقط.
            </p>
          </div>
          <Landmark className="h-6 w-6 text-violet-700" />
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-muted/70 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">الحساب</th>
                <th className="p-3">النوع</th>
                <th className="p-3">الخطة USD</th>
                <th className="p-3">الفعلي USD</th>
                <th className="p-3">الانحراف</th>
                {access.data?.canManage && <th className="p-3">تعديل الخطة</th>}
              </tr>
            </thead>
            <tbody>
              {budgets.data?.rows.map(row => {
                const draft =
                  budgetDrafts[row.accountId] ?? String(row.budgetMinor / 100);
                return (
                  <tr key={row.accountId} className="border-t border-border">
                    <td className="p-3 font-bold">
                      <span className="ml-2 font-mono text-muted-foreground">
                        {row.code}
                      </span>
                      {row.name}
                    </td>
                    <td className="p-3">
                      {row.type === "revenue" ? "إيراد" : "مصروف"}
                    </td>
                    <td className="p-3">{money(row.budgetMinor)}</td>
                    <td className="p-3">{money(row.actualMinor)}</td>
                    <td
                      className={`p-3 font-bold ${row.varianceMinor < 0 ? "text-red-600" : "text-emerald-700"}`}
                    >
                      {money(row.varianceMinor)}
                    </td>
                    {access.data?.canManage && (
                      <td className="p-3">
                        <div className="flex min-w-[220px] items-center gap-2">
                          <input
                            aria-label={`موازنة ${row.name}`}
                            inputMode="decimal"
                            value={draft}
                            onChange={event =>
                              setBudgetDrafts(current => ({
                                ...current,
                                [row.accountId]: event.target.value,
                              }))
                            }
                            className="h-9 w-28 rounded-lg border border-input bg-background px-2 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              saveBudget.isPending ||
                              !Number.isFinite(Number(draft)) ||
                              Number(draft) < 0
                            }
                            onClick={() =>
                              saveBudget.mutate({
                                accountId: row.accountId,
                                budgetMinor: Math.round(Number(draft) * 100),
                              })
                            }
                          >
                            حفظ
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!budgets.data?.rows.length && (
                <tr>
                  <td
                    colSpan={access.data?.canManage ? 6 : 5}
                    className="p-6 text-center text-muted-foreground"
                  >
                    لا توجد حسابات إيراد أو مصروف متاحة للموازنة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-blue-700">
                ملخص الأداء التشغيلي
              </p>
              <h3 className="mt-1 text-xl font-black">
                الربحية من القيود المرحلة
              </h3>
            </div>
            <BarChart3 className="h-6 w-6 text-blue-700" />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Metric label="الإيرادات" value={money(performance.revenue)} />
            <Metric
              label="تكلفة المبيعات"
              value={money(performance.costOfSales)}
            />
            <Metric
              label="إجمالي الربح"
              value={money(performance.grossProfit)}
            />
            <Metric
              label="هامش الإجمالي"
              value={ratio(performance.grossMarginBps)}
            />
            <Metric
              label="مصروف الرواتب"
              value={money(performance.payrollExpense)}
            />
            <Metric
              label="المصروفات التشغيلية"
              value={money(performance.operatingExpenses)}
            />
            <Metric
              label="الربح التشغيلي"
              value={money(performance.operatingProfit)}
            />
            <Metric
              label="هامش التشغيل"
              value={ratio(performance.operatingMarginBps)}
            />
          </dl>
        </article>
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-700">ملخص السيولة</p>
              <h3 className="mt-1 text-xl font-black">رأس المال العامل</h3>
            </div>
            <Landmark className="h-6 w-6 text-emerald-700" />
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Metric
              label="الأصول المتداولة"
              value={money(liquidity.currentAssets)}
            />
            <Metric
              label="الالتزامات المتداولة"
              value={money(liquidity.currentLiabilities)}
            />
            <Metric
              label="صافي رأس المال العامل"
              value={money(liquidity.netWorkingCapital)}
            />
            <Metric
              label="نسبة التداول"
              value={ratio(liquidity.currentRatioBps)}
            />
          </dl>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            تعتمد السيولة على الصندوق والبنوك والذمم والمخزون، مقابل الذمم
            ورواتب مستحقة في دليل الحسابات الحالي.
          </p>
        </article>
      </section>
      <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-cyan-700">التدفقات النقدية</p>
            <h3 className="mt-1 text-xl font-black">
              حركة الصندوق والبنوك من القيود المرحلة
            </h3>
          </div>
          <CircleDollarSign className="h-6 w-6 text-cyan-700" />
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label="تشغيلي" value={money(data.cashFlow?.operating ?? 0)} />
          <Metric
            label="استثماري"
            value={money(data.cashFlow?.investing ?? 0)}
          />
          <Metric label="تمويلي" value={money(data.cashFlow?.financing ?? 0)} />
          <Metric
            label="صافي التغير"
            value={money(data.cashFlow?.netChange ?? 0)}
          />
        </dl>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          يُصنّف التقرير الحركات حسب مصدر القيد. تبقى المراجعة البشرية مطلوبة
          عند وجود قيود يدوية بمصدر غير محدد.
        </p>
      </article>
      <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
        <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h3 className="font-black">ميزان المراجعة</h3>
            <p
              className={`mt-1 text-xs font-bold ${data.totals.balanced ? "text-emerald-700" : "text-red-600"}`}
            >
              {data.totals.balanced ? "الميزان متوازن" : "يوجد فرق في الميزان"}
            </p>
          </div>
          <div className="max-h-[440px] overflow-auto">
            <table className="w-full min-w-[620px] text-right text-sm">
              <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">الرمز</th>
                  <th className="p-3">الحساب</th>
                  <th className="p-3">مدين</th>
                  <th className="p-3">دائن</th>
                </tr>
              </thead>
              <tbody>
                {data.trialBalance.map(row => (
                  <tr key={row.code} className="border-t border-border">
                    <td className="p-3 font-mono">{row.code}</td>
                    <td className="p-3 font-bold">{row.name}</td>
                    <td className="p-3">{money(Number(row.debitMinor))}</td>
                    <td className="p-3">{money(Number(row.creditMinor))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">أعمار الذمم</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            الرصيد غير المسدد لكل طرف بالدولار الأمريكي، موزع حسب تأخر تاريخ
            الاستحقاق.
          </p>
          <div className="mt-5 space-y-3">
            {data.aging.map(row => (
              <div
                key={`${row.partnerName}-${row.type}`}
                className="rounded-xl bg-muted/50 p-3"
              >
                <p className="font-bold">{row.partnerName}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{row.type}</span>
                  <strong className="text-foreground">
                    {money(Number(row.totalMinor))}
                  </strong>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-5">
                  <span>
                    حالي:{" "}
                    <strong className="text-foreground">
                      {money(Number(row.currentMinor))}
                    </strong>
                  </span>
                  <span>
                    1–30:{" "}
                    <strong className="text-foreground">
                      {money(Number(row.days1To30Minor))}
                    </strong>
                  </span>
                  <span>
                    31–60:{" "}
                    <strong className="text-foreground">
                      {money(Number(row.days31To60Minor))}
                    </strong>
                  </span>
                  <span>
                    61–90:{" "}
                    <strong className="text-foreground">
                      {money(Number(row.days61To90Minor))}
                    </strong>
                  </span>
                  <span>
                    90+:{" "}
                    <strong className="text-foreground">
                      {money(Number(row.daysOver90Minor))}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
            {!data.aging.length && (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                لا توجد ذمم مرحلة بعد.
              </p>
            )}
          </div>
        </article>
      </section>
      <section className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]">
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">الميزانية العمومية</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            ملخص أرصدة الأصول والالتزامات وحقوق الملكية وأرباح الفترة من القيود
            المرحلة.
          </p>
          <div className="mt-5 space-y-3">
            {[
              ["الأصول", data.balanceSheet.assets],
              ["الالتزامات", data.balanceSheet.liabilities],
              ["حقوق الملكية", data.balanceSheet.equity],
              ["أرباح الفترة الحالية", data.balanceSheet.currentPeriodEarnings],
              [
                "الالتزامات وحقوق الملكية",
                data.balanceSheet.liabilitiesAndEquity,
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-xl bg-muted/50 p-3"
              >
                <span className="font-bold">{label}</span>
                <strong>{money(Number(value))}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h3 className="font-black">الدفتر العام</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              آخر 200 سطر من القيود المرحلة بالدولار الأمريكي.
            </p>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[720px] text-right text-sm">
              <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">القيد</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الحساب</th>
                  <th className="p-3">مدين</th>
                  <th className="p-3">دائن</th>
                </tr>
              </thead>
              <tbody>
                {data.generalLedger.map(row => (
                  <tr
                    key={`${row.entryNumber}-${row.accountCode}`}
                    className="border-t border-border"
                  >
                    <td className="p-3 font-mono">{row.entryNumber}</td>
                    <td className="p-3">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="p-3 font-bold">
                      {row.accountCode} — {row.accountName}
                    </td>
                    <td className="p-3">{money(Number(row.debitMinor))}</td>
                    <td className="p-3">{money(Number(row.creditMinor))}</td>
                  </tr>
                ))}
                {!data.generalLedger.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-muted-foreground"
                    >
                      لا توجد قيود مرحلة بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/55 p-3">
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-black">{value}</dd>
    </div>
  );
}

export function PriceListItemsPanel() {
  const utils = trpc.useUtils();
  const access = trpc.accounting.access.useQuery();
  const priceLists = trpc.accounting.priceLists.useQuery(undefined, {
    enabled: access.data?.canManage ?? false,
  });
  const [priceListId, setPriceListId] = useState("");
  const priceItems = trpc.accounting.priceListItems.useQuery(
    { priceListId: Number(priceListId || 0) },
    { enabled: Boolean(priceListId) && (access.data?.canManage ?? false) }
  );
  const inventory = trpc.inventory.overview.useQuery(undefined, {
    enabled: access.data?.canManage ?? false,
  });
  const [draft, setDraft] = useState({ variantId: "", unitPriceMinor: "" });
  const save = trpc.accounting.upsertPriceListItem.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ سعر الصنف في القائمة");
      setDraft(current => ({ ...current, unitPriceMinor: "" }));
      await utils.accounting.priceListItems.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (!priceListId && priceLists.data?.[0])
      setPriceListId(String(priceLists.data[0].id));
  }, [priceListId, priceLists.data]);
  if (!access.data?.canManage) return null;
  const selected = priceLists.data?.find(
    item => String(item.id) === priceListId
  );
  const variants = (inventory.data?.items ?? []).flatMap(item =>
    item.variants.map(variant => ({
      id: variant.id,
      label:
        `${item.name} — ${variant.color ?? ""} ${variant.size ?? ""}`.trim(),
    }))
  );
  const money = (value: number) =>
    new Intl.NumberFormat("ar-IQ", {
      style: "currency",
      currency: selected?.currencyCode ?? "USD",
      currencyDisplay: "code",
      maximumFractionDigits: selected?.currencyCode === "IQD" ? 0 : 2,
    }).format(value / 100);
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-violet-700">تسعير الأصناف</p>
          <h3 className="mt-1 text-xl font-black">
            أسعار الأصناف في قوائم البيع
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            السعر المسجل هنا يطبق تلقائياً على صنف فاتورة البيع عند اختيار
            القائمة. يبقى الصنف غير المسعر قابلاً لإدخال السعر يدوياً، وتظل حدود
            الخصم الخاصة بالقائمة سارية.
          </p>
        </div>
        <CircleDollarSign className="h-6 w-6 text-violet-700" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1.1fr_1fr_170px_auto]">
        <SelectInput
          label="قائمة الأسعار"
          value={priceListId}
          onChange={value => {
            setPriceListId(value);
            setDraft({ variantId: "", unitPriceMinor: "" });
          }}
          options={(priceLists.data ?? []).map(
            item =>
              [
                String(item.id),
                `${item.code} — ${item.name} (${item.currencyCode})`,
              ] as [string, string]
          )}
          required
        />
        <SelectInput
          label="الصنف"
          value={draft.variantId}
          onChange={value => setDraft({ ...draft, variantId: value })}
          options={variants.map(
            item => [String(item.id), item.label] as [string, string]
          )}
          required
        />
        <TextInput
          label={`السعر (${selected?.currencyCode ?? "USD"} minor)`}
          value={draft.unitPriceMinor}
          onChange={value => setDraft({ ...draft, unitPriceMinor: value })}
          type="number"
          required
        />
        <div className="flex items-end">
          <Button
            disabled={
              !priceListId ||
              !draft.variantId ||
              !Number.isInteger(Number(draft.unitPriceMinor)) ||
              Number(draft.unitPriceMinor) < 0 ||
              save.isPending
            }
            onClick={() =>
              save.mutate({
                priceListId: Number(priceListId),
                variantId: Number(draft.variantId),
                unitPriceMinor: Number(draft.unitPriceMinor),
              })
            }
            className="w-full bg-violet-700 hover:bg-violet-800"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ
            السعر
          </Button>
        </div>
      </div>
      <div className="mt-5 overflow-auto">
        <table className="w-full min-w-[620px] text-right text-sm">
          <thead className="bg-muted/70 text-xs text-muted-foreground">
            <tr>
              <th className="p-3">الصنف</th>
              <th className="p-3">اللون/المقاس</th>
              <th className="p-3">الباركود</th>
              <th className="p-3">السعر</th>
            </tr>
          </thead>
          <tbody>
            {priceItems.data?.items.map(item => (
              <tr key={item.id} className="border-t border-border">
                <td className="p-3 font-bold">{item.itemName}</td>
                <td className="p-3">
                  {item.color ?? "—"} {item.size ?? ""}
                </td>
                <td className="p-3 font-mono text-xs">{item.barcode ?? "—"}</td>
                <td className="p-3 font-black">{money(item.unitPriceMinor)}</td>
              </tr>
            ))}
            {!priceItems.data?.items.length && (
              <tr>
                <td
                  colSpan={4}
                  className="p-5 text-center text-muted-foreground"
                >
                  لا توجد أسعار أصناف في هذه القائمة بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function QuantityTierPricingPanel() {
  const utils = trpc.useUtils();
  const access = trpc.accounting.access.useQuery();
  const priceLists = trpc.accounting.priceLists.useQuery(undefined, {
    enabled: access.data?.canManage ?? false,
  });
  const inventory = trpc.inventory.overview.useQuery(undefined, {
    enabled: access.data?.canManage ?? false,
  });
  const [priceListId, setPriceListId] = useState("");
  const priceItems = trpc.accounting.priceListItems.useQuery(
    { priceListId: Number(priceListId || 0) },
    { enabled: Boolean(priceListId) && (access.data?.canManage ?? false) }
  );
  const [draft, setDraft] = useState({
    variantId: "",
    minimumQuantity: "",
    unitPriceMinor: "",
  });
  const save = trpc.accounting.upsertPriceListItemTier.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ مستوى الكمية");
      setDraft(current => ({
        ...current,
        minimumQuantity: "",
        unitPriceMinor: "",
      }));
      await utils.accounting.priceListItems.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (!priceListId && priceLists.data?.[0])
      setPriceListId(String(priceLists.data[0].id));
  }, [priceListId, priceLists.data]);
  if (!access.data?.canManage) return null;
  const selected = priceLists.data?.find(
    item => String(item.id) === priceListId
  );
  const variants = (inventory.data?.items ?? []).flatMap(item =>
    item.variants.map(variant => ({
      id: variant.id,
      label:
        `${item.name} — ${variant.color ?? ""} ${variant.size ?? ""}`.trim(),
    }))
  );
  const money = (value: number) =>
    new Intl.NumberFormat("ar-IQ", {
      style: "currency",
      currency: selected?.currencyCode ?? "USD",
      currencyDisplay: "code",
      maximumFractionDigits: selected?.currencyCode === "IQD" ? 0 : 2,
    }).format(value / 100);
  const valid =
    Boolean(priceListId && draft.variantId) &&
    Number.isInteger(Number(draft.minimumQuantity)) &&
    Number(draft.minimumQuantity) >= 2 &&
    Number.isInteger(Number(draft.unitPriceMinor)) &&
    Number(draft.unitPriceMinor) >= 0;
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="text-sm font-bold text-indigo-700">تسعير حسب الكمية</p>
        <h3 className="mt-1 text-xl font-black">مستويات سعر الجملة</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          احفظ أولاً سعر الأساس في بطاقة أسعار الأصناف، ثم أنشئ مستويات تبدأ من
          كمية 2 أو أكثر. يختار النظام أعلى مستوى تحقق كميته على الخادم عند حفظ
          فاتورة البيع.
        </p>
      </div>
      <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr_160px_180px_auto]">
        <SelectInput
          label="قائمة الأسعار"
          value={priceListId}
          onChange={value => {
            setPriceListId(value);
            setDraft({
              variantId: "",
              minimumQuantity: "",
              unitPriceMinor: "",
            });
          }}
          options={(priceLists.data ?? []).map(
            item =>
              [String(item.id), `${item.code} — ${item.name}`] as [
                string,
                string,
              ]
          )}
          required
        />
        <SelectInput
          label="الصنف"
          value={draft.variantId}
          onChange={value => setDraft({ ...draft, variantId: value })}
          options={variants.map(
            item => [String(item.id), item.label] as [string, string]
          )}
          required
        />
        <TextInput
          label="الحد الأدنى"
          value={draft.minimumQuantity}
          onChange={value => setDraft({ ...draft, minimumQuantity: value })}
          type="number"
          required
        />
        <TextInput
          label={`سعر المستوى (${selected?.currencyCode ?? "USD"} minor)`}
          value={draft.unitPriceMinor}
          onChange={value => setDraft({ ...draft, unitPriceMinor: value })}
          type="number"
          required
        />
        <div className="flex items-end">
          <Button
            disabled={!valid || save.isPending}
            onClick={() =>
              save.mutate({
                priceListId: Number(priceListId),
                variantId: Number(draft.variantId),
                minimumQuantity: Number(draft.minimumQuantity),
                unitPriceMinor: Number(draft.unitPriceMinor),
              })
            }
            className="w-full bg-indigo-700 hover:bg-indigo-800"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}حفظ
            المستوى
          </Button>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {priceItems.data?.items.map(item => (
          <div
            key={item.id}
            className="rounded-2xl border border-border bg-muted/25 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-black">
                {item.itemName}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  {item.color ?? ""} {item.size ?? ""}
                </span>
              </span>
              <span className="text-sm font-bold">
                سعر الأساس: {money(item.unitPriceMinor)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.tiers.length ? (
                item.tiers.map(tier => (
                  <span
                    key={tier.id}
                    className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-900"
                  >
                    من {tier.minimumQuantity} وحدة: {money(tier.unitPriceMinor)}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  لا توجد مستويات كمية لهذا الصنف.
                </span>
              )}
            </div>
          </div>
        ))}
        {!priceItems.data?.items.length && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            احفظ سعر أساس للصنف أولاً، ثم أضف له مستويات كمية.
          </p>
        )}
      </div>
    </article>
  );
}

export function ChequesPanel() {
  const utils = trpc.useUtils();
  const cheques = trpc.accounting.cheques.useQuery();
  const paymentAccounts = trpc.accounting.paymentAccounts.useQuery();
  const [bankByCheque, setBankByCheque] = useState<Record<number, string>>({});
  const settle = trpc.accounting.settleCheque.useMutation({
    onSuccess: async result => {
      toast.success(
        result.status === "cleared"
          ? "تمت تسوية الشيك وترحيل قيده"
          : "تم تسجيل ارتداد الشيك وإعادة الذمة"
      );
      await Promise.all([
        utils.accounting.cheques.invalidate(),
        utils.accounting.journals.invalidate(),
        utils.accounting.reports.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const status = {
    pending: ["معلق", "bg-amber-100 text-amber-800"],
    cleared: ["مسوّى", "bg-emerald-100 text-emerald-800"],
    bounced: ["مرتد", "bg-red-100 text-red-800"],
  } as const;
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat("ar-IQ", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: currency === "IQD" ? 0 : 2,
    }).format(value / 100);
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">دورة الشيكات</p>
          <h3 className="mt-1 text-xl font-black">شيكات تحت التحصيل وصادرة</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            عند اعتماد سند مرتبط بدفتر شيكات ينشأ هنا سجل معلق. التحصيل أو الصرف
            ينقل المبلغ إلى البنك؛ والارتداد يعيد الذمة. لا يمكن تغيير حالة
            الشيك أكثر من مرة.
          </p>
        </div>
        <Landmark className="h-6 w-6 text-emerald-700" />
      </div>
      <div className="mt-5 space-y-3">
        {cheques.data?.map(cheque => {
          const [label, badgeClass] = status[cheque.status];
          const banks = (paymentAccounts.data ?? []).filter(
            account =>
              account.type === "bank" &&
              account.currencyCode === cheque.currencyCode
          );
          const bankId = bankByCheque[cheque.id] ?? "";
          return (
            <div
              key={cheque.id}
              className="rounded-2xl border border-border bg-muted/25 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">
                    شيك {cheque.chequeNumber}{" "}
                    <span className="mr-2 text-sm font-normal text-muted-foreground">
                      {cheque.direction === "received" ? "مقبوض" : "صادر"}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {cheque.documentNumber} · {cheque.paymentAccountName} ·{" "}
                    {money(cheque.amountMinor, cheque.currencyCode)}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2 py-1 text-xs font-black ${badgeClass}`}
                >
                  {label}
                </span>
              </div>
              {cheque.status === "pending" && (
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                  <SelectInput
                    label="البنك عند التسوية"
                    value={bankId}
                    onChange={value =>
                      setBankByCheque(current => ({
                        ...current,
                        [cheque.id]: value,
                      }))
                    }
                    options={banks.map(
                      account =>
                        [String(account.id), account.name] as [string, string]
                    )}
                  />
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      disabled={!bankId || settle.isPending}
                      onClick={() =>
                        settle.mutate({
                          chequeId: cheque.id,
                          action: "clear",
                          bankPaymentAccountId: Number(bankId),
                        })
                      }
                      className="w-full bg-emerald-700 hover:bg-emerald-800"
                    >
                      تسوية في البنك
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settle.isPending}
                      onClick={() =>
                        settle.mutate({ chequeId: cheque.id, action: "bounce" })
                      }
                      className="w-full border-red-200 text-red-700 hover:bg-red-50"
                    >
                      تسجيل ارتداد
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!cheques.data?.length && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            لا توجد شيكات مرحلة بعد.
          </p>
        )}
      </div>
    </article>
  );
}

export function AdvancedPayrollPanel() {
  const utils = trpc.useUtils();
  const configuration = trpc.accounting.configuration.useQuery();
  const contracts = trpc.accounting.employeeContracts.useQuery();
  const leaves = trpc.accounting.employeeLeaves.useQuery();
  const [contract, setContract] = useState({
    employeeId: "",
    contractNumber: "",
    contractType: "permanent",
    startsOn: new Date().toISOString().slice(0, 10),
    endsOn: "",
    baseSalaryMinor: "",
    currencyCode: "USD",
    allowancesJson: "[]",
    insurancePercent: "0",
    taxPercent: "0",
  });
  const [leave, setLeave] = useState({
    employeeId: "",
    leaveType: "annual",
    startsOn: new Date().toISOString().slice(0, 10),
    endsOn: new Date().toISOString().slice(0, 10),
    days: "1",
    note: "",
  });
  const saveContract = trpc.accounting.createEmployeeContract.useMutation({
    onSuccess: async () => {
      toast.success("تم حفظ عقد الموظف وإعداداته");
      await utils.accounting.employeeContracts.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const saveLeave = trpc.accounting.createEmployeeLeave.useMutation({
    onSuccess: async () => {
      toast.success("تم تسجيل الإجازة وإرسالها للاعتماد");
      await utils.accounting.employeeLeaves.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const approveLeave = trpc.accounting.approveEmployeeLeave.useMutation({
    onSuccess: async () => {
      toast.success("تم اعتماد الإجازة");
      await utils.accounting.employeeLeaves.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const employees = configuration.data?.employees ?? [];
  const parseAllowances = () => {
    try {
      const value = JSON.parse(contract.allowancesJson);
      if (!Array.isArray(value)) throw new Error();
      return value
        .map(item => ({
          name: String(item.name ?? "").trim(),
          amountMinor: Math.max(0, Math.round(Number(item.amountMinor ?? 0))),
        }))
        .filter(item => item.name);
    } catch {
      toast.error(
        'البدلات يجب أن تكون JSON مثل [{"name":"سكن","amountMinor":50000}]'
      );
      return null;
    }
  };
  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-7 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/25 dark:text-blue-100">
        <p className="font-black">الرواتب المتقدمة</p>
        <p>
          العقد يحفظ الراتب الأساسي والبدلات ونسب التأمين والضريبة يدوياً. لا
          يفرض النظام نسبة قانونية تلقائية؛ أدخل النسب المعتمدة من المحاسب وملف
          الدولة المختار.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <FormCard icon={UsersRound} title="عقد وبدلات موظف">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              const allowances = parseAllowances();
              if (!allowances || !contract.employeeId) return;
              saveContract.mutate({
                employeeId: Number(contract.employeeId),
                contractNumber: contract.contractNumber,
                contractType: contract.contractType as
                  | "permanent"
                  | "fixedTerm"
                  | "partTime"
                  | "consultant",
                startsOn: new Date(`${contract.startsOn}T00:00:00Z`),
                endsOn: contract.endsOn
                  ? new Date(`${contract.endsOn}T23:59:59Z`)
                  : undefined,
                baseSalaryMinor: Number(contract.baseSalaryMinor),
                currencyCode: contract.currencyCode,
                allowances,
                insuranceRateBps: Math.round(
                  Number(contract.insurancePercent) * 100
                ),
                taxRateBps: Math.round(Number(contract.taxPercent) * 100),
              });
            }}
          >
            <SelectInput
              label="الموظف"
              value={contract.employeeId}
              onChange={value =>
                setContract({ ...contract, employeeId: value })
              }
              options={employees.map(
                item => [String(item.id), item.fullName] as [string, string]
              )}
              required
            />
            <TextInput
              label="رقم العقد"
              value={contract.contractNumber}
              onChange={value =>
                setContract({ ...contract, contractNumber: value })
              }
              required
            />
            <SelectInput
              label="نوع العقد"
              value={contract.contractType}
              onChange={value =>
                setContract({ ...contract, contractType: value })
              }
              options={[
                ["permanent", "دائم"],
                ["fixedTerm", "محدد المدة"],
                ["partTime", "دوام جزئي"],
                ["consultant", "استشاري"],
              ]}
              required
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="بداية العقد"
                value={contract.startsOn}
                onChange={value =>
                  setContract({ ...contract, startsOn: value })
                }
                type="date"
                required
              />
              <TextInput
                label="نهاية العقد (اختياري)"
                value={contract.endsOn}
                onChange={value => setContract({ ...contract, endsOn: value })}
                type="date"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput
                label="الراتب الأساسي (minor)"
                value={contract.baseSalaryMinor}
                onChange={value =>
                  setContract({ ...contract, baseSalaryMinor: value })
                }
                type="number"
                required
              />
              <TextInput
                label="التأمين %"
                value={contract.insurancePercent}
                onChange={value =>
                  setContract({ ...contract, insurancePercent: value })
                }
                type="number"
              />
              <TextInput
                label="الضريبة %"
                value={contract.taxPercent}
                onChange={value =>
                  setContract({ ...contract, taxPercent: value })
                }
                type="number"
              />
            </div>
            <label className="grid gap-1.5 text-sm font-bold">
              البدلات بصيغة JSON
              <textarea
                value={contract.allowancesJson}
                onChange={event =>
                  setContract({
                    ...contract,
                    allowancesJson: event.target.value,
                  })
                }
                className="min-h-20 rounded-xl border border-input bg-background p-3 font-mono text-xs"
              />
              <span className="text-[11px] font-normal text-muted-foreground">
                مثال: [{"{"}name":"سكن","amountMinor":50000{"}"}].
              </span>
            </label>
            <Button
              disabled={saveContract.isPending}
              className="bg-blue-700 hover:bg-blue-800"
            >
              {saveContract.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              حفظ العقد
            </Button>
          </form>
        </FormCard>
        <FormCard icon={CalendarCheck2} title="إجازة موظف">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              if (!leave.employeeId) return;
              saveLeave.mutate({
                employeeId: Number(leave.employeeId),
                leaveType: leave.leaveType as
                  | "annual"
                  | "sick"
                  | "unpaid"
                  | "maternity"
                  | "other",
                startsOn: new Date(`${leave.startsOn}T00:00:00Z`),
                endsOn: new Date(`${leave.endsOn}T23:59:59Z`),
                days: Number(leave.days),
                note: leave.note || undefined,
              });
            }}
          >
            <SelectInput
              label="الموظف"
              value={leave.employeeId}
              onChange={value => setLeave({ ...leave, employeeId: value })}
              options={employees.map(
                item => [String(item.id), item.fullName] as [string, string]
              )}
              required
            />
            <SelectInput
              label="نوع الإجازة"
              value={leave.leaveType}
              onChange={value => setLeave({ ...leave, leaveType: value })}
              options={[
                ["annual", "سنوية"],
                ["sick", "مرضية"],
                ["unpaid", "بدون راتب"],
                ["maternity", "أمومة"],
                ["other", "أخرى"],
              ]}
              required
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput
                label="من"
                value={leave.startsOn}
                onChange={value => setLeave({ ...leave, startsOn: value })}
                type="date"
                required
              />
              <TextInput
                label="إلى"
                value={leave.endsOn}
                onChange={value => setLeave({ ...leave, endsOn: value })}
                type="date"
                required
              />
              <TextInput
                label="عدد الأيام"
                value={leave.days}
                onChange={value => setLeave({ ...leave, days: value })}
                type="number"
                required
              />
            </div>
            <TextInput
              label="ملاحظة"
              value={leave.note}
              onChange={value => setLeave({ ...leave, note: value })}
            />
            <Button
              disabled={saveLeave.isPending}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              {saveLeave.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              تسجيل وإرسال للاعتماد
            </Button>
          </form>
        </FormCard>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <ListCard
          title="العقود المحفوظة"
          rows={(contracts.data ?? []).map(
            item =>
              `${item.employeeName} · ${item.contract.contractNumber} · ${item.contract.status} · تأمين ${item.contract.insuranceRateBps / 100}% · ضريبة ${item.contract.taxRateBps / 100}%`
          )}
        />
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">الإجازات والاعتمادات</h3>
          <div className="mt-4 space-y-2">
            {(leaves.data ?? []).map(item => (
              <div
                key={item.leave.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3"
              >
                <span className="text-sm font-bold">
                  {item.employeeName} · {item.leave.leaveType} ·{" "}
                  {item.leave.days} يوم · {item.leave.status}
                </span>
                {item.leave.status === "pendingApproval" && (
                  <Button
                    size="sm"
                    disabled={approveLeave.isPending}
                    onClick={() =>
                      approveLeave.mutate({ leaveId: item.leave.id })
                    }
                  >
                    اعتماد
                  </Button>
                )}
              </div>
            ))}
            {!leaves.data?.length && (
              <p className="text-sm text-muted-foreground">
                لا توجد إجازات مسجلة.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export function MfaSecurityPanel() {
  const utils = trpc.useUtils();
  const status = trpc.auth.mfaStatus.useQuery();
  const sessions = trpc.auth.sessions.useQuery();
  const security = trpc.accounting.securitySettings.useQuery();
  const [setup, setSetup] = useState<{
    secret: string;
    provisioningUri: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [securityForm, setSecurityForm] = useState({
    sessionDurationMinutes: "1440",
    maxFailedAttempts: "5",
  });
  useEffect(() => {
    if (security.data)
      setSecurityForm({
        sessionDurationMinutes: String(security.data.sessionDurationMinutes),
        maxFailedAttempts: String(security.data.maxFailedAttempts),
      });
  }, [security.data?.sessionDurationMinutes, security.data?.maxFailedAttempts]);
  const begin = trpc.auth.beginMfaSetup.useMutation({
    onSuccess: value => {
      setSetup(value);
      setCode("");
    },
    onError: error => toast.error(error.message),
  });
  const confirm = trpc.auth.confirmMfaSetup.useMutation({
    onSuccess: async () => {
      setSetup(null);
      setCode("");
      toast.success("تم تفعيل MFA عبر Authenticator");
      await utils.auth.mfaStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const disable = trpc.auth.disableMfa.useMutation({
    onSuccess: async () => {
      toast.success("تم تعطيل MFA");
      await utils.auth.mfaStatus.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = trpc.auth.revokeSession.useMutation({
    onSuccess: async () => {
      toast.success("تم إبطال الجلسة");
      await utils.auth.sessions.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateSecurity = trpc.accounting.updateSecuritySettings.useMutation({
    onSuccess: () => toast.success("تم حفظ سياسة الجلسات"),
    onError: error => toast.error(error.message),
  });
  return (
    <FormCard
      icon={ShieldCheck}
      title="الأمان متعدد العوامل (MFA) وتدقيق الجلسات"
    >
      <p className="text-sm leading-6 text-muted-foreground">
        يمكن للمدير تفعيل تطبيق Authenticator لكل حسابه. بعد التفعيل لن يكتمل
        الدخول بكلمة المرور وحدها. خيار البريد محفوظ في المخطط، ويحتاج ربط مزود
        بريد الشركة قبل تفعيله فعلياً.
      </p>
      <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm font-bold">
        الحالة: {status.data?.enabled ? "مفعّل عبر Authenticator" : "غير مفعّل"}
      </div>
      {!status.data?.enabled && !setup && (
        <Button
          type="button"
          onClick={() => begin.mutate()}
          disabled={begin.isPending}
          className="mt-4 bg-blue-700 hover:bg-blue-800"
        >
          {begin.isPending && <Loader2 className="h-4 w-4 animate-spin" />}بدء
          إعداد Authenticator
        </Button>
      )}
      {setup && (
        <div className="mt-4 grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p>أضف الحساب في تطبيق Authenticator أو أدخل المفتاح السري:</p>
          <code className="break-all rounded bg-white p-2 text-xs">
            {setup.secret}
          </code>
          <p className="text-xs">
            ثم أدخل الرمز الحالي المكوّن من 6 أرقام لتأكيد التفعيل.
          </p>
          <div className="flex gap-2">
            <input
              aria-label="رمز تفعيل MFA"
              inputMode="numeric"
              value={code}
              onChange={event =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-center tracking-[0.35em]"
            />
            <Button
              type="button"
              disabled={confirm.isPending || code.length !== 6}
              onClick={() => confirm.mutate({ code })}
            >
              تأكيد
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSetup(null)}
            >
              إلغاء
            </Button>
          </div>
        </div>
      )}
      {status.data?.enabled && (
        <Button
          type="button"
          variant="outline"
          disabled={disable.isPending}
          onClick={() => {
            if (window.confirm("هل تريد تعطيل MFA لهذا الحساب؟"))
              disable.mutate();
          }}
          className="mt-4"
        >
          تعطيل MFA
        </Button>
      )}
      <form
        className="mt-5 grid gap-3 border-t border-border pt-4"
        onSubmit={event => {
          event.preventDefault();
          updateSecurity.mutate({
            sessionDurationMinutes: Number(securityForm.sessionDurationMinutes),
            maxFailedAttempts: Number(securityForm.maxFailedAttempts),
          });
        }}
      >
        <h4 className="font-black">سياسة الجلسات</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="مدة الجلسة بالدقائق (15–10080)"
            type="number"
            value={securityForm.sessionDurationMinutes}
            onChange={value =>
              setSecurityForm({
                ...securityForm,
                sessionDurationMinutes: value,
              })
            }
            required
          />
          <TextInput
            label="محاولات الدخول الفاشلة قبل المنع"
            type="number"
            value={securityForm.maxFailedAttempts}
            onChange={value =>
              setSecurityForm({ ...securityForm, maxFailedAttempts: value })
            }
            required
          />
        </div>
        <Button
          type="submit"
          disabled={updateSecurity.isPending}
          className="bg-blue-700 hover:bg-blue-800"
        >
          حفظ سياسة الجلسات
        </Button>
      </form>
      <div className="mt-5 border-t border-border pt-4">
        <h4 className="font-black">الجلسات الأخيرة</h4>
        <div className="mt-3 space-y-2">
          {(sessions.data ?? []).map(session => (
            <div
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-xs"
            >
              <div>
                <p className="font-bold">
                  {session.userAgent || "جهاز غير معروف"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  IP: {session.ipAddress || "غير مسجل"} · بدأ{" "}
                  {formatDateTime(session.createdAt)}
                </p>
              </div>
              {!session.revokedAt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revoke.mutate({ sessionId: session.id })}
                >
                  إبطال
                </Button>
              )}
            </div>
          ))}
          {!sessions.data?.length && (
            <p className="text-xs text-muted-foreground">
              لا توجد جلسات نشطة مسجلة.
            </p>
          )}
        </div>
      </div>
    </FormCard>
  );
}

export function AccountingAdministrationPanel() {
  const utils = trpc.useUtils();
  const config = trpc.accounting.configuration.useQuery();
  const warehouseBalances = trpc.accounting.warehouseBalances.useQuery();
  const [branch, setBranch] = useState({
    code: "",
    name: "",
    warehouseName: "",
  });
  const [employee, setEmployee] = useState({
    fullName: "",
    employeeNumber: "",
    jobTitle: "",
    salaryInputMinor: "",
    salaryCurrencyCode: "USD",
    salaryExchangeRatePpm: "1",
    branchId: "",
  });
  const [assignment, setAssignment] = useState({
    targetUserId: "",
    roleId: "",
    branchId: "",
  });
  const [internalUser, setInternalUser] = useState({
    name: "",
    username: "",
    password: "",
    roleId: "",
    branchId: "",
  });
  const [passwordReset, setPasswordReset] = useState({
    userId: null as number | null,
    password: "",
  });
  const [paymentAccount, setPaymentAccount] = useState({
    name: "",
    type: "cash" as "cash" | "bank" | "cheque",
    currencyCode: "USD",
    isMultiCurrency: false,
    branchId: "",
  });
  const [costCenter, setCostCenter] = useState({ code: "", name: "" });
  const [editingCostCenterId, setEditingCostCenterId] = useState<number | null>(
    null
  );
  const [editingCostCenterName, setEditingCostCenterName] = useState("");
  const [costCenterNameOverrides, setCostCenterNameOverrides] = useState<
    Record<number, string>
  >({});
  const [attendance, setAttendance] = useState({
    employeeId: "",
    workDate: new Date().toISOString().slice(0, 10),
    status: "present" as "present" | "absent" | "leave" | "holiday",
    overtimeMinutes: "0",
  });
  const reload = () => utils.accounting.configuration.invalidate();
  const createBranch = trpc.accounting.createBranch.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء الفرع والمخزن");
      setBranch({ code: "", name: "", warehouseName: "" });
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const createEmployee = trpc.accounting.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("تمت إضافة الموظف");
      setEmployee({
        fullName: "",
        employeeNumber: "",
        jobTitle: "",
        salaryInputMinor: "",
        salaryCurrencyCode: "USD",
        salaryExchangeRatePpm: "1",
        branchId: "",
      });
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const assignRole = trpc.accounting.assignRole.useMutation({
    onSuccess: () => {
      toast.success("تم تعيين الصلاحية");
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const createInternalUser = trpc.accounting.createInternalUser.useMutation({
    onSuccess: () => {
      toast.success("تم إنشاء حساب المستخدم الداخلي وتعيين دوره.");
      setInternalUser({
        name: "",
        username: "",
        password: "",
        roleId: "",
        branchId: "",
      });
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const updateInternalUser = trpc.accounting.updateInternalUser.useMutation({
    onSuccess: result => {
      toast.success(
        result.isActive ? "تم تفعيل حساب المستخدم" : "تم إيقاف حساب المستخدم"
      );
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const resetInternalUserPassword =
    trpc.accounting.resetInternalUserPassword.useMutation({
      onSuccess: () => {
        toast.success("تم تعيين كلمة مرور جديدة للحساب.");
        setPasswordReset({ userId: null, password: "" });
      },
      onError: error => toast.error(error.message),
    });
  const createPaymentAccount = trpc.accounting.createPaymentAccount.useMutation(
    {
      onSuccess: () => {
        toast.success("تمت إضافة حساب الدفع");
        setPaymentAccount({
          name: "",
          type: "cash",
          currencyCode: "USD",
          isMultiCurrency: false,
          branchId: "",
        });
        reload();
      },
      onError: error => toast.error(error.message),
    }
  );
  const updatePaymentAccount = trpc.accounting.updatePaymentAccount.useMutation(
    {
      onSuccess: result => {
        toast.success(
          result.isActive ? "تم تفعيل حساب الدفع" : "تم إيقاف حساب الدفع"
        );
        reload();
      },
      onError: error => toast.error(error.message),
    }
  );
  const createCostCenter = trpc.accounting.createCostCenter.useMutation({
    onSuccess: () => {
      toast.success("تمت إضافة مركز التكلفة");
      setCostCenter({ code: "", name: "" });
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const updateCostCenter = trpc.accounting.updateCostCenter.useMutation({
    onSuccess: () => {
      toast.success("تم تحديث مركز التكلفة");
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const recordAttendance = trpc.accounting.recordAttendance.useMutation({
    onSuccess: () => {
      toast.success("تم تسجيل الحضور");
      reload();
    },
    onError: error => toast.error(error.message),
  });
  const closePeriod = trpc.accounting.closePeriod.useMutation({
    onSuccess: result => {
      toast.success(
        result.openingEntryId
          ? "تم إقفال السنة وفتح السنة التالية وإنشاء القيد الافتتاحي"
          : "تم إقفال السنة وفتح السنة التالية"
      );
      reload();
    },
    onError: error => toast.error(error.message),
  });
  if (config.isLoading)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
      </div>
    );
  const data = config.data;
  if (!data) return null;
  const closeReadiness = data.closeReadiness;
  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm font-bold text-blue-700">إدارة النظام المالي</p>
        <h2 className="mt-1 text-3xl font-black">
          الفروع والموظفون والصلاحيات
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          يتم إنشاء مخزن افتراضي مع كل فرع، ويمكن تقييد الموظف بدور محاسبي داخل
          فرع محدد.
        </p>
      </header>
      <CompanyBrandingPanel />
      <CountryProfilePanel />
      <PermissionBoard />
      <PriceListItemsPanel />
      <QuantityTierPricingPanel />
      <ChequesPanel />
      <section className="grid gap-5 xl:grid-cols-3">
        <FormCard icon={Building2} title="فرع ومخزن جديد">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              createBranch.mutate(branch);
            }}
          >
            <TextInput
              label="رمز الفرع"
              value={branch.code}
              onChange={value => setBranch({ ...branch, code: value })}
              required
            />
            <TextInput
              label="اسم الفرع"
              value={branch.name}
              onChange={value => setBranch({ ...branch, name: value })}
              required
            />
            <TextInput
              label="اسم المخزن الأول"
              value={branch.warehouseName}
              onChange={value => setBranch({ ...branch, warehouseName: value })}
              required
            />
            <Button
              disabled={createBranch.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {createBranch.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إضافة فرع
            </Button>
          </form>
        </FormCard>
        <FormCard icon={UsersRound} title="حساب مستخدم داخلي">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              createInternalUser.mutate({
                name: internalUser.name,
                username: internalUser.username,
                password: internalUser.password,
                roleId: Number(internalUser.roleId),
                branchId: internalUser.branchId
                  ? Number(internalUser.branchId)
                  : undefined,
              });
            }}
          >
            <TextInput
              label="اسم المستخدم الظاهر"
              value={internalUser.name}
              onChange={value =>
                setInternalUser({ ...internalUser, name: value })
              }
              required
            />
            <TextInput
              label="اسم الدخول"
              value={internalUser.username}
              onChange={value =>
                setInternalUser({ ...internalUser, username: value })
              }
              required
            />
            <TextInput
              label="كلمة المرور المؤقتة"
              value={internalUser.password}
              onChange={value =>
                setInternalUser({ ...internalUser, password: value })
              }
              type="password"
              required
            />
            <SelectInput
              label="الدور"
              value={internalUser.roleId}
              onChange={value =>
                setInternalUser({ ...internalUser, roleId: value })
              }
              options={data.roles.map(item => [String(item.id), item.name])}
              required
            />
            <SelectInput
              label="تقييد بفرع (اختياري)"
              value={internalUser.branchId}
              onChange={value =>
                setInternalUser({ ...internalUser, branchId: value })
              }
              options={data.branches.map(item => [String(item.id), item.name])}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              كلمة المرور لا تُعرض أو تُحفظ كنص؛ تُخزّن بتجزئة آمنة. يجب أن تكون
              10 محارف أو أكثر.
            </p>
            <Button
              disabled={
                createInternalUser.isPending ||
                !internalUser.roleId ||
                internalUser.password.length < 10
              }
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {createInternalUser.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إنشاء حساب المستخدم
            </Button>
          </form>
        </FormCard>
        <FormCard icon={UsersRound} title="موظف جديد">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              createEmployee.mutate({
                fullName: employee.fullName,
                employeeNumber: employee.employeeNumber,
                jobTitle: employee.jobTitle || undefined,
                salaryAmount: Number(employee.salaryInputMinor),
                salaryCurrencyCode: employee.salaryCurrencyCode,
                salaryExchangeRate: Number(employee.salaryExchangeRatePpm),
                branchId: employee.branchId
                  ? Number(employee.branchId)
                  : undefined,
              });
            }}
          >
            <TextInput
              label="الاسم الكامل"
              value={employee.fullName}
              onChange={value =>
                setEmployee({
                  ...employee,
                  employeeNumber: employee.employeeNumber,
                  fullName: value,
                })
              }
              required
            />
            <TextInput
              label="رقم الموظف"
              value={employee.employeeNumber}
              onChange={value =>
                setEmployee({ ...employee, employeeNumber: value })
              }
              required
            />
            <TextInput
              label="قيمة الراتب الشهري"
              value={employee.salaryInputMinor}
              onChange={value =>
                setEmployee({ ...employee, salaryInputMinor: value })
              }
              type="number"
              required
            />
            <SelectInput
              label="عملة الراتب"
              value={employee.salaryCurrencyCode}
              onChange={value =>
                setEmployee({
                  ...employee,
                  salaryCurrencyCode: value,
                  salaryExchangeRatePpm:
                    value === "USD" ? "1" : employee.salaryExchangeRatePpm,
                })
              }
              options={Array.from(
                new Set(data.currencies.map(item => item.code))
              ).map(code => [code, code] as [string, string])}
              required
            />
            <TextInput
              label="سعر التحويل إلى USD لكل وحدة عملة"
              value={employee.salaryExchangeRatePpm}
              onChange={value =>
                setEmployee({ ...employee, salaryExchangeRatePpm: value })
              }
              type="number"
              required
            />
            <p className="-mt-1 text-xs leading-5 text-muted-foreground">
              يُحفظ الراتب بالعملة المختارة ويُحسب مكافئه بالدولار للتقارير
              ومسير الرواتب. اكتب 1 للدولار؛ مثال تقريبي للدينار العراقي:
              0.00076.
            </p>
            <SelectInput
              label="الفرع"
              value={employee.branchId}
              onChange={value => setEmployee({ ...employee, branchId: value })}
              options={data.branches.map(item => [String(item.id), item.name])}
            />
            <Button
              disabled={createEmployee.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {createEmployee.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إضافة موظف
            </Button>
          </form>
        </FormCard>
        <FormCard icon={ShieldCheck} title="تعيين دور لمستخدم">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              assignRole.mutate({
                targetUserId: Number(assignment.targetUserId),
                roleId: Number(assignment.roleId),
                branchId: assignment.branchId
                  ? Number(assignment.branchId)
                  : undefined,
              });
            }}
          >
            <SelectInput
              label="المستخدم"
              value={assignment.targetUserId}
              onChange={value =>
                setAssignment({ ...assignment, targetUserId: value })
              }
              options={data.users.map(item => [
                String(item.id),
                item.name || item.email || `مستخدم ${item.id}`,
              ])}
              required
            />
            <SelectInput
              label="الدور"
              value={assignment.roleId}
              onChange={value =>
                setAssignment({ ...assignment, roleId: value })
              }
              options={data.roles.map(item => [String(item.id), item.name])}
              required
            />
            <SelectInput
              label="تقييد بفرع (اختياري)"
              value={assignment.branchId}
              onChange={value =>
                setAssignment({ ...assignment, branchId: value })
              }
              options={data.branches.map(item => [String(item.id), item.name])}
            />
            <Button
              disabled={assignRole.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {assignRole.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              تعيين الدور
            </Button>
          </form>
        </FormCard>
      </section>
      <section className="grid gap-5 xl:grid-cols-3">
        <FormCard icon={Landmark} title="صندوق أو بنك أو شيكات">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              createPaymentAccount.mutate({
                ...paymentAccount,
                branchId: paymentAccount.branchId
                  ? Number(paymentAccount.branchId)
                  : undefined,
              });
            }}
          >
            <TextInput
              label="اسم الحساب"
              value={paymentAccount.name}
              onChange={value =>
                setPaymentAccount({ ...paymentAccount, name: value })
              }
              required
            />
            <SelectInput
              label="النوع"
              value={paymentAccount.type}
              onChange={value =>
                setPaymentAccount({
                  ...paymentAccount,
                  type: value as "cash" | "bank" | "cheque",
                })
              }
              options={[
                ["cash", "صندوق نقدي"],
                ["bank", "حساب مصرفي"],
                ["cheque", "دفتر شيكات"],
              ]}
              required
            />
            <SelectInput
              label="العملة"
              value={paymentAccount.currencyCode}
              onChange={value =>
                setPaymentAccount({ ...paymentAccount, currencyCode: value })
              }
              options={Array.from(
                new Set(data.currencies.map(item => item.code))
              ).map(code => [code, code] as [string, string])}
              required
            />
            <label className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm font-bold dark:border-blue-950 dark:bg-blue-950/20">
              <input
                type="checkbox"
                checked={paymentAccount.isMultiCurrency}
                onChange={event =>
                  setPaymentAccount({
                    ...paymentAccount,
                    isMultiCurrency: event.target.checked,
                  })
                }
              />
              صندوق متعدد العملات (IQD و USD)
            </label>
            <SelectInput
              label="الفرع"
              value={paymentAccount.branchId}
              onChange={value =>
                setPaymentAccount({ ...paymentAccount, branchId: value })
              }
              options={data.branches.map(item => [String(item.id), item.name])}
            />
            <Button
              disabled={createPaymentAccount.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {createPaymentAccount.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إضافة حساب
            </Button>
          </form>
        </FormCard>
        <FormCard icon={BarChart3} title="مركز تكلفة">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              createCostCenter.mutate(costCenter);
            }}
          >
            <TextInput
              label="رمز المركز"
              value={costCenter.code}
              onChange={value => setCostCenter({ ...costCenter, code: value })}
              required
            />
            <TextInput
              label="اسم المركز"
              value={costCenter.name}
              onChange={value => setCostCenter({ ...costCenter, name: value })}
              required
            />
            <p className="text-xs leading-5 text-muted-foreground">
              تُدار المراكز هنا وتصبح متاحة لاحقاً لتوزيع بنود القيود
              والمستندات.
            </p>
            <Button
              disabled={createCostCenter.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {createCostCenter.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              إضافة مركز
            </Button>
          </form>
        </FormCard>
        <FormCard icon={CalendarCheck2} title="تسجيل حضور موظف">
          <form
            className="grid gap-3"
            onSubmit={event => {
              event.preventDefault();
              recordAttendance.mutate({
                employeeId: Number(attendance.employeeId),
                workDate: new Date(`${attendance.workDate}T00:00:00Z`),
                status: attendance.status,
                overtimeMinutes: Number(attendance.overtimeMinutes),
              });
            }}
          >
            <SelectInput
              label="الموظف"
              value={attendance.employeeId}
              onChange={value =>
                setAttendance({ ...attendance, employeeId: value })
              }
              options={data.employees.map(item => [
                String(item.id),
                item.fullName,
              ])}
              required
            />
            <TextInput
              label="التاريخ"
              value={attendance.workDate}
              onChange={value =>
                setAttendance({ ...attendance, workDate: value })
              }
              type="date"
              required
            />
            <SelectInput
              label="الحالة"
              value={attendance.status}
              onChange={value =>
                setAttendance({
                  ...attendance,
                  status: value as typeof attendance.status,
                })
              }
              options={[
                ["present", "حاضر"],
                ["absent", "غائب"],
                ["leave", "إجازة"],
                ["holiday", "عطلة"],
              ]}
              required
            />
            <TextInput
              label="دقائق إضافية"
              value={attendance.overtimeMinutes}
              onChange={value =>
                setAttendance({ ...attendance, overtimeMinutes: value })
              }
              type="number"
            />
            <Button
              disabled={recordAttendance.isPending}
              className="mt-1 bg-blue-700 hover:bg-blue-800"
            >
              {recordAttendance.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              تسجيل الحضور
            </Button>
          </form>
        </FormCard>
        <FormCard icon={LockKeyhole} title="إقفال السنة المالية">
          <p className="text-sm leading-6 text-muted-foreground">
            يقفل الإجراء الفترة المفتوحة بعد ترحيل المستندات والمسيرات والقيود
            والتحقق من اتزان كل قيد. لا يمكن ترحيل مستندات جديدة فيها لاحقاً.
          </p>
          {closeReadiness.canClose ? (
            <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              الفترة جاهزة للإقفال.
            </p>
          ) : (
            <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              <li>مستند غير مرحل: {closeReadiness.unpostedDocuments}</li>
              <li>مسير رواتب غير مرحل: {closeReadiness.unpostedPayrollRuns}</li>
              <li>قيد غير مرحل: {closeReadiness.unpostedJournalEntries}</li>
              <li>قيد غير متوازن: {closeReadiness.unbalancedJournalEntries}</li>
            </ul>
          )}
          <Button
            type="button"
            disabled={closePeriod.isPending || !closeReadiness.canClose}
            onClick={() => {
              if (
                window.confirm("هل أنت متأكد من إقفال الفترة المالية المفتوحة؟")
              )
                closePeriod.mutate();
            }}
            className="mt-5 w-full bg-red-700 hover:bg-red-800"
          >
            {closePeriod.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {closeReadiness.canClose
              ? "إقفال الفترة المفتوحة"
              : "أكمل المتطلبات قبل الإقفال"}
          </Button>
        </FormCard>
      </section>
      <AdvancedPayrollPanel />
      <div className="mt-5">
        <MfaSecurityPanel />
      </div>
      <section className="grid gap-5 xl:grid-cols-3">
        <ListCard
          title="الفروع"
          rows={data.branches.map(item => `${item.code} — ${item.name}`)}
        />
        <ListCard
          title="قوائم الأسعار"
          rows={data.priceLists.map(
            item => `${item.name} — حد خصم ${item.maxDiscountBps / 100}%`
          )}
        />
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">حسابات الدفع</h3>
          <div className="mt-4 space-y-2">
            {data.paymentAccounts.map(item => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-bold">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.type === "cash"
                      ? "صندوق نقدي"
                      : item.type === "bank"
                        ? "حساب مصرفي"
                        : "دفتر شيكات"}{" "}
                    · {item.currencyCode}
                    {item.branchId ? ` · فرع #${item.branchId}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`${item.isActive ? "إيقاف" : "تفعيل"} حساب ${item.name}`}
                  disabled={updatePaymentAccount.isPending}
                  onClick={() =>
                    updatePaymentAccount.mutate({
                      paymentAccountId: item.id,
                      isActive: !item.isActive,
                    })
                  }
                >
                  {item.isActive ? "إيقاف" : "تفعيل"}
                </Button>
              </div>
            ))}
            {!data.paymentAccounts.length && (
              <p className="text-sm text-muted-foreground">
                لا توجد حسابات دفع بعد.
              </p>
            )}
          </div>
        </article>
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">مراكز التكلفة</h3>
          <div className="mt-4 space-y-2">
            {data.costCenters.map(item => {
              const currentName = costCenterNameOverrides[item.id] ?? item.name;
              const isEditing = editingCostCenterId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <input
                        aria-label={`اسم مركز ${item.code}`}
                        value={editingCostCenterName}
                        onChange={event =>
                          setEditingCostCenterName(event.target.value)
                        }
                        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm font-bold"
                      />
                    ) : (
                      <span className="text-sm font-bold">
                        {item.code} — {currentName}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          disabled={
                            updateCostCenter.isPending ||
                            !editingCostCenterName.trim()
                          }
                          onClick={() =>
                            updateCostCenter.mutate(
                              {
                                costCenterId: item.id,
                                name: editingCostCenterName.trim(),
                                isActive: item.isActive,
                              },
                              {
                                onSuccess: () => {
                                  setCostCenterNameOverrides(names => ({
                                    ...names,
                                    [item.id]: editingCostCenterName.trim(),
                                  }));
                                  setEditingCostCenterId(null);
                                },
                              }
                            )
                          }
                        >
                          حفظ الاسم
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingCostCenterId(null)}
                        >
                          إلغاء
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCostCenterId(item.id);
                            setEditingCostCenterName(currentName);
                          }}
                        >
                          إعادة تسمية
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateCostCenter.isPending}
                          onClick={() =>
                            updateCostCenter.mutate({
                              costCenterId: item.id,
                              name: currentName,
                              isActive: !item.isActive,
                            })
                          }
                        >
                          {item.isActive ? "إيقاف" : "تفعيل"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {!data.costCenters.length && (
              <p className="text-sm text-muted-foreground">
                لا توجد مراكز تكلفة بعد.
              </p>
            )}
          </div>
        </article>
        <ListCard
          title="أرصدة المخازن"
          rows={(warehouseBalances.data ?? []).map(
            item =>
              `${item.branchName} — ${item.warehouseName}: ${item.itemName} ${item.color ?? ""} ${item.size ?? ""} = ${item.quantity}`
          )}
        />
        <ListCard
          title="تعيينات الصلاحيات"
          rows={data.assignments.map(
            item => `${item.roleName} — مستخدم #${item.userId}`
          )}
        />
        <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="font-black">حسابات المستخدمين الداخلية</h3>
          <div className="mt-4 space-y-2">
            {data.users
              .filter(user => user.isInternalUser)
              .map(user => (
                <div key={user.id} className="rounded-xl bg-muted/50 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold">
                        {user.name ?? user.username}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {user.username} · {user.isActive ? "نشط" : "موقوف"}
                        {user.lastInternalSignedIn
                          ? ` · آخر دخول ${new Date(user.lastInternalSignedIn).toLocaleDateString("ar-IQ")}`
                          : " · لم يسجل دخولاً بعد"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`${user.isActive ? "إيقاف" : "تفعيل"} المستخدم ${user.username}`}
                        disabled={updateInternalUser.isPending}
                        onClick={() =>
                          updateInternalUser.mutate({
                            targetUserId: user.id,
                            isActive: !user.isActive,
                          })
                        }
                      >
                        {user.isActive ? "إيقاف" : "تفعيل"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPasswordReset({ userId: user.id, password: "" })
                        }
                      >
                        إعادة ضبط كلمة المرور
                      </Button>
                    </div>
                  </div>
                  {passwordReset.userId === user.id && (
                    <form
                      className="mt-3 flex flex-wrap items-end gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        resetInternalUserPassword.mutate({
                          targetUserId: user.id,
                          password: passwordReset.password,
                        });
                      }}
                    >
                      <label className="grid gap-1 text-xs font-bold">
                        كلمة مرور جديدة
                        <input
                          aria-label={`كلمة مرور جديدة للمستخدم ${user.username}`}
                          type="password"
                          value={passwordReset.password}
                          onChange={event =>
                            setPasswordReset({
                              userId: user.id,
                              password: event.target.value,
                            })
                          }
                          className="h-9 rounded-lg border border-border bg-card px-3 font-normal"
                          required
                        />
                      </label>
                      <Button
                        size="sm"
                        disabled={
                          resetInternalUserPassword.isPending ||
                          passwordReset.password.length < 10
                        }
                      >
                        حفظ كلمة المرور
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() =>
                          setPasswordReset({ userId: null, password: "" })
                        }
                      >
                        إلغاء
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            {!data.users.some(user => user.isInternalUser) && (
              <p className="text-sm text-muted-foreground">
                لا توجد حسابات داخلية بعد.
              </p>
            )}
          </div>
        </article>
      </section>
    </section>
  );
}

function FormCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="font-black">{title}</h3>
      </div>
      {children}
    </article>
  );
}
function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold">
      {label}
      <input
        required={required}
        type={type}
        min={type === "number" ? "0" : undefined}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal"
      />
    </label>
  );
}
function SelectInput({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold">
      {label}
      <select
        required={required}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal"
      >
        <option value="">—</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
function ListCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-black">{title}</h3>
      <div className="mt-4 space-y-2">
        {rows.map(row => (
          <p key={row} className="rounded-xl bg-muted/50 px-3 py-2 text-sm">
            {row}
          </p>
        ))}
        {!rows.length && (
          <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
            لا توجد بيانات بعد.
          </p>
        )}
      </div>
    </article>
  );
}
