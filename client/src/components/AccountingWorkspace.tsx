import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/dateTime";
import {
  getAccountingUiAccess,
  getEnabledAccountingQueries,
  type AccountingWorkspaceTab,
} from "@shared/accountingAccess";
import {
  AccountingAdministrationPanel,
  FinancialReportsPanel,
} from "./AccountingPanels";
import { AttendanceReviewPanel } from "./AttendanceReviewPanel";
import { AccountingMovementsPanel } from "./AccountingMovementsPanel";
import { EmployeeQuickAdd } from "./EmployeeQuickAdd";
import { FixedAssetsPanel } from "./FixedAssetsPanel";
import { PayrollPeriodForm } from "./PayrollPeriodForm";
import {
  exportReportToExcel,
  printReportToPdf,
  type ReportSection,
} from "@/lib/reportExport";
import {
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FilePlus2,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  Settings2,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

type Language = "ar" | "en";
type Tab = AccountingWorkspaceTab;
type DocumentType =
  | "saleInvoice"
  | "purchaseInvoice"
  | "salesReturn"
  | "purchaseReturn"
  | "receipt"
  | "payment"
  | "stockTransfer";
type DraftDocumentLine = {
  id: string;
  variantId: string;
  sourceDocumentLineId: string;
  description: string;
  quantity: string;
  price: string;
  discount: string;
};

const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const todayDateKey = () => new Date().toISOString().slice(0, 10);
export const safeDateKey = (value: string) =>
  dateKeyPattern.test(value) ? value : todayDateKey();
const dateKeyFromDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const dateKeyOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKeyFromDate(date);
};
const startOfWeekDateKey = () => {
  const date = new Date();
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateKeyFromDate(date);
};
const startOfMonthDateKey = () => {
  const date = new Date();
  date.setDate(1);
  return dateKeyFromDate(date);
};
const endOfPreviousMonthDateKey = () => {
  const date = new Date();
  date.setDate(0);
  return dateKeyFromDate(date);
};
const startOfPreviousMonthDateKey = () => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return dateKeyFromDate(date);
};

const ar = {
  title: "المحاسبة والإدارة المالية",
  subtitle:
    "قيود مزدوجة، فواتير معتمدة، مراكز تكلفة، ورواتب ضمن دورة مالية مضبوطة.",
  overview: "لوحة المحاسبة",
  documents: "المستندات",
  accounts: "دليل الحسابات",
  journals: "القيود",
  dailyEntries: "الإدخالات اليومية",
  approvals: "الموافقات",
  payroll: "الرواتب",
  newDocument: "مستند جديد",
  documentType: "نوع المستند",
  description: "البيان",
  quantity: "الكمية",
  unitPrice: "سعر الوحدة",
  currency: "العملة",
  partner: "العميل أو المورد",
  note: "ملاحظة",
  save: "حفظ وترحيل",
  submit: "طلب موافقة",
  approve: "اعتماد وترحيل",
  pending: "بانتظار الموافقة",
  posted: "مرحّل",
  draft: "مسودة",
  assets: "حسابات",
  entries: "قيود مرحلة",
  employees: "موظفون",
  createPayroll: "إنشاء مسير رواتب",
  noData: "لا توجد بيانات بعد",
  created: "تم حفظ وترحيل المستند مباشرة",
  submitted: "تم إرسال المستند للموافقة",
  approved: "تم اعتماد المستند وترحيله",
  payrollCreated: "تم إنشاء مسير الرواتب",
  reports: "التقارير المالية",
  fixedAssets: "الأصول الثابتة",
  administration: "إدارة النظام",
};
const en = {
  ...ar,
  title: "Accounting & finance",
  subtitle: "Double-entry, approved documents, cost centres and payroll.",
  overview: "Accounting dashboard",
  documents: "Documents",
  accounts: "Chart of accounts",
  journals: "Journals",
  dailyEntries: "Daily entries",
  approvals: "Approvals",
  payroll: "Payroll",
  reports: "Financial reports",
  fixedAssets: "Fixed assets",
  administration: "System administration",
  newDocument: "New document",
  documentType: "Document type",
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Unit price",
  currency: "Currency",
  partner: "Customer or supplier",
  note: "Note",
  save: "Save draft",
  submit: "Request approval",
  approve: "Approve & post",
  pending: "Pending approval",
  posted: "Posted",
  draft: "Draft",
  assets: "Accounts",
  entries: "Posted journals",
  employees: "Employees",
  createPayroll: "Create payroll run",
  noData: "No data yet",
  created: "Document saved and posted",
  submitted: "Document submitted",
  approved: "Document posted",
  payrollCreated: "Payroll run created",
};

const types: Array<[DocumentType, string]> = [
  ["saleInvoice", "فاتورة مبيعات"],
  ["purchaseInvoice", "فاتورة مشتريات"],
  ["receipt", "سند قبض"],
  ["payment", "سند صرف"],
  ["salesReturn", "مرتجع مبيعات"],
  ["purchaseReturn", "مرتجع مشتريات"],
  ["stockTransfer", "تحويل مخزني"],
];
const statusClass: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pendingApproval: "bg-amber-100 text-amber-800",
  posted: "bg-emerald-100 text-emerald-800",
  approved: "bg-blue-100 text-blue-800",
  cancelled: "bg-red-100 text-red-800",
};
export const createDraftLineId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newLine = (): DraftDocumentLine => ({
  id: createDraftLineId(),
  variantId: "",
  sourceDocumentLineId: "",
  description: "",
  quantity: "1",
  price: "",
  discount: "0",
});

type Total9ImportRow = {
  entryDate: Date;
  entryType: "expense" | "receipt" | "payment" | "transfer" | "adjustment";
  voucherNumber?: string;
  description: string;
  category?: string;
  note?: string;
  sourceSheet: string;
  currencyCode: "USD" | "IQD";
  marketExchangeRate?: number;
  amountMinor: number;
};

function parseTotal9Money(value: unknown) {
  const text = String(value ?? "")
    .replace(/[,$\s؜د.ع.‏]/g, "")
    .replace(/[^0-9.-]/g, "");
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseTotal9Date(
  value: unknown,
  spreadsheetDateParser?: (
    value: number
  ) => { y: number; m: number; d: number } | null
) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = spreadsheetDateParser?.(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, 12));
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text.replace(/-/g, "/");
  const parts = normalized.split("/").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    const [first, second, third] = parts;
    const yearValue = first! > 31 ? first! : third!;
    const year = yearValue! < 100 ? yearValue! + 2000 : yearValue!;
    const month = first! > 31 ? second! : second! > 12 ? first! : second!;
    const day = first! > 31 ? third! : second! > 12 ? second! : first!;
    const date = new Date(Date.UTC(year!, month! - 1, day!, 12));
    if (!Number.isNaN(date.getTime())) return date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function parseTotal9Workbook(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const output: Total9ImportRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    for (
      let headerIndex = 0;
      headerIndex < Math.min(rows.length, 12);
      headerIndex += 1
    ) {
      const header = (rows[headerIndex] ?? []).map(value =>
        String(value).trim().toLowerCase()
      );
      const dateIndex = header.findIndex(
        value => value.includes("تاريخ") || value.includes("date")
      );
      const iqdIndex = header.findIndex(
        value => value.includes("دينار") || value.includes("iqd")
      );
      const usdIndex = header.findIndex(
        value =>
          value.includes("دولار") || value.includes("usd") || value === "dollar"
      );
      const detailIndex = header.findIndex(
        value =>
          value.includes("تفاصيل") ||
          value.includes("description") ||
          value.includes("شرح")
      );
      const receiptIndex = header.findIndex(
        value => value.includes("وصل") || value.includes("receipt")
      );
      if (dateIndex < 0 || (iqdIndex < 0 && usdIndex < 0)) continue;
      for (const row of rows.slice(headerIndex + 1)) {
        const date = parseTotal9Date(row[dateIndex], value =>
          XLSX.SSF.parse_date_code(value)
        );
        const iqd = iqdIndex >= 0 ? parseTotal9Money(row[iqdIndex]) : 0;
        const usd = usdIndex >= 0 ? parseTotal9Money(row[usdIndex]) : 0;
        if (!date || (!iqd && !usd)) continue;
        const description = String(
          row[detailIndex >= 0 ? detailIndex : 0] ?? ""
        ).trim();
        if (!description || /^total|^المجموع/i.test(description)) continue;
        const rate = iqd && usd ? Number((iqd / usd).toFixed(4)) : undefined;
        output.push({
          entryDate: date,
          entryType: sheetName.includes("صندوق") ? "payment" : "expense",
          voucherNumber:
            receiptIndex >= 0 && row[receiptIndex]
              ? String(row[receiptIndex]).trim()
              : undefined,
          description,
          category: sheetName.trim() || "مصاريف تشغيلية",
          note:
            receiptIndex >= 0 && row[receiptIndex]
              ? `رقم الوصل: ${String(row[receiptIndex])}`
              : undefined,
          sourceSheet: sheetName,
          currencyCode: iqd ? "IQD" : "USD",
          marketExchangeRate: iqd ? rate || 1570 : 1,
          amountMinor: Math.round(iqd || usd * 100),
        });
      }
      break;
    }
  }
  return output.slice(0, 2_000);
}

function DailyEntryPanel({
  language,
  canCreate,
  canPost,
  canCarryCashForward,
  canApproveCash,
}: {
  language: Language;
  canCreate: boolean;
  canPost: boolean;
  canCarryCashForward: boolean;
  canApproveCash: boolean;
}) {
  const isEnglish = language === "en";
  const utils = trpc.useUtils();
  const accounts = trpc.accounting.accounts.useQuery(undefined, {
    enabled: canCreate || canPost,
  });
  const paymentAccounts = trpc.accounting.paymentAccounts.useQuery(undefined, {
    enabled: canCreate || canPost,
  });
  const costCenters = trpc.accounting.costCenters.useQuery(undefined, {
    enabled: canCreate || canPost,
  });
  const customers = trpc.commerce.partners.list.useQuery(
    { type: "customer" },
    { enabled: canCreate || canPost }
  );
  const suppliers = trpc.commerce.partners.list.useQuery(
    { type: "supplier" },
    { enabled: canCreate || canPost }
  );
  const entries = trpc.accounting.dailyEntries.useQuery(undefined, {
    enabled: canCreate || canPost,
  });
  const dailyRate = trpc.accounting.dailyExchangeRate.useQuery(
    { currencyCode: "IQD" },
    { enabled: canCreate || canPost }
  );
  const setDailyRate = trpc.accounting.setDailyExchangeRate.useMutation({
    onSuccess: async result => {
      setMarketExchangeRate(String(result.marketExchangeRate));
      await utils.accounting.dailyExchangeRate.invalidate({
        currencyCode: "IQD",
      });
      toast.success(
        isEnglish
          ? "Today's rate was updated"
          : "تم تحديث سعر اليوم وتطبيقه على المستخدمين"
      );
    },
    onError: error => toast.error(error.message),
  });
  const [cashDate, setCashDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [cashAccountId, setCashAccountId] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cashCurrency, setCashCurrency] = useState<"USD" | "IQD">("IQD");
  const [cashDescription, setCashDescription] = useState("");
  const [cashReceiptNote, setCashReceiptNote] = useState("");
  const [cashContraAccountId, setCashContraAccountId] = useState("");
  const [cashActualAmount, setCashActualAmount] = useState("");
  const [cashReconciliationNote, setCashReconciliationNote] = useState("");
  const [cashPeriodFromDate, setCashPeriodFromDate] = useState(() =>
    todayDateKey()
  );
  const [cashPeriodToDate, setCashPeriodToDate] = useState(() =>
    todayDateKey()
  );
  const safeCashPeriodFromDate = safeDateKey(cashPeriodFromDate);
  const safeCashPeriodToDate = safeDateKey(cashPeriodToDate);
  const selectedCashAccount = (paymentAccounts.data ?? []).find(
    account => String(account.id) === cashAccountId
  );
  const selectedCashAccountCurrency =
    selectedCashAccount?.currencyCode === "USD" ? "USD" : "IQD";
  const cashCurrencyMismatch =
    Boolean(selectedCashAccount) &&
    !selectedCashAccount?.isMultiCurrency &&
    selectedCashAccountCurrency !== cashCurrency;
  const cashSummary = trpc.accounting.dailyCashSummary.useQuery(
    {
      date: cashDate,
      paymentAccountId: cashAccountId ? Number(cashAccountId) : undefined,
      currencyCode: cashCurrency,
    },
    { enabled: (canCreate || canPost) && !cashCurrencyMismatch }
  );
  const cashPeriodReport = trpc.accounting.cashPeriodReport.useQuery(
    {
      fromDate: safeCashPeriodFromDate,
      toDate: safeCashPeriodToDate,
      paymentAccountId: cashAccountId ? Number(cashAccountId) : undefined,
      currencyCode: cashCurrency,
    },
    {
      enabled:
        (canCreate || canPost) &&
        !cashCurrencyMismatch &&
        safeCashPeriodFromDate <= safeCashPeriodToDate,
    }
  );
  const cashReconciliationHistory =
    trpc.accounting.cashReconciliationHistory.useQuery(
      {
        paymentAccountId: cashAccountId ? Number(cashAccountId) : undefined,
        limit: 90,
      },
      { enabled: canCreate || canPost }
    );
  const parsedCashActualAmount = Number(cashActualAmount);
  const cashActualMinor =
    cashActualAmount.trim() && Number.isFinite(parsedCashActualAmount)
      ? Math.round(parsedCashActualAmount * (cashCurrency === "USD" ? 100 : 1))
      : null;
  const cashRecordedClosingMinor = cashSummary.data?.totals.closingMinor ?? 0;
  const cashReconciliationDifferenceMinor =
    cashActualMinor === null
      ? null
      : cashActualMinor - cashRecordedClosingMinor;
  useEffect(() => {
    if (!cashAccountId && paymentAccounts.data?.[0])
      setCashAccountId(String(paymentAccounts.data[0].id));
    if (!cashContraAccountId) {
      const revenue = accounts.data?.find(account => account.code === "4100");
      if (revenue) setCashContraAccountId(String(revenue.id));
    }
  }, [accounts.data, cashAccountId, cashContraAccountId, paymentAccounts.data]);
  useEffect(() => {
    if (selectedCashAccount) setCashCurrency(selectedCashAccountCurrency);
  }, [selectedCashAccount?.id, selectedCashAccountCurrency]);
  const createCashReceipt = trpc.accounting.createDailyEntry.useMutation({
    onSuccess: async () => {
      toast.success(isEnglish ? "Receipt saved and posted" : "تم تسجيل المقبوضات وإضافتها إلى الرصيد مباشرة");
      setCashAmount("");
      setCashDescription("");
      setCashReceiptNote("");
      await Promise.all([
        utils.accounting.dailyEntries.invalidate(),
        utils.accounting.dailyCashSummary.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const carryForwardCash = trpc.accounting.carryForwardCash.useMutation({
    onSuccess: async result => {
      toast.success(`تم ترحيل الرصيد إلى ${result.nextDate}`);
      await utils.accounting.dailyCashSummary.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const saveCashReconciliation =
    trpc.accounting.saveCashReconciliation.useMutation({
      onSuccess: async () => {
        toast.success("تم حفظ مطابقة الصندوق في السجل");
        await utils.accounting.cashReconciliationHistory.invalidate();
      },
      onError: error => toast.error(error.message),
    });
  const submitCashApproval =
    trpc.accounting.submitDailyEntryForApproval.useMutation({
      onSuccess: async () => {
        toast.success("تم إرسال العملية للموافقة");
        await Promise.all([
          utils.accounting.dailyEntries.invalidate(),
          utils.accounting.dailyCashSummary.invalidate(),
        ]);
      },
      onError: error => toast.error(error.message),
    });
  const approveCashEntry = trpc.accounting.approveDailyEntry.useMutation({
    onSuccess: async () => {
      toast.success("تم اعتماد العملية وترحيلها");
      await Promise.all([
        utils.accounting.dailyEntries.invalidate(),
        utils.accounting.dailyCashSummary.invalidate(),
        utils.accounting.journals.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [entryType, setEntryType] = useState<
    "expense" | "receipt" | "payment" | "transfer" | "adjustment"
  >("expense");
  const [description, setDescription] = useState("");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [customerPartnerId, setCustomerPartnerId] = useState("");
  const [supplierPartnerId, setSupplierPartnerId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<{
    url: string;
    key: string;
    name: string;
  } | null>(null);
  const [currencyCode, setCurrencyCode] = useState<"USD" | "IQD">("USD");
  const [marketExchangeRate, setMarketExchangeRate] = useState("1");
  const [amount, setAmount] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  useEffect(() => {
    if (currencyCode === "IQD" && dailyRate.data)
      setMarketExchangeRate(String(dailyRate.data.marketExchangeRate));
  }, [currencyCode, dailyRate.data]);
  type QuickRow = {
    date: string;
    type: "expense" | "receipt" | "payment" | "transfer" | "adjustment";
    voucher: string;
    description: string;
    amount: string;
    currency: "USD" | "IQD";
    debit: string;
    credit: string;
    costCenter: string;
    customer: string;
    supplier: string;
    paymentAccount: string;
  };
  const blankQuickRow = (): QuickRow => ({
    date: new Date().toISOString().slice(0, 10),
    type: "expense",
    voucher: "",
    description: "",
    amount: "",
    currency: "USD",
    debit: "",
    credit: "",
    costCenter: "",
    customer: "",
    supplier: "",
    paymentAccount: "",
  });
  const [quickRows, setQuickRows] = useState<QuickRow[]>([blankQuickRow()]);
  const [pasteRows, setPasteRows] = useState("");
  const [dailyFilter, setDailyFilter] = useState({
    start: "",
    end: "",
    type: "all",
    account: "",
    search: "",
    status: "all",
    min: "",
    max: "",
  });
  const create = trpc.accounting.createDailyEntry.useMutation({
    onSuccess: async () => {
      toast.success(
        isEnglish
          ? "Daily entry saved and posted"
          : "تم تسجيل الإدخال اليومي وإضافته مباشرة إلى الحركات"
      );
      setDescription("");
      setVoucherNumber("");
      setCustomerPartnerId("");
      setSupplierPartnerId("");
      setCategory("");
      setNote("");
      setAmount("");
      setAttachment(null);
      await Promise.all([
        utils.accounting.dailyEntries.invalidate(),
        utils.accounting.dailyCashSummary.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const uploadAttachment = trpc.accounting.uploadDailyAttachment.useMutation({
    onSuccess: result => {
      setAttachment(current => ({
        url: result.url,
        key: result.key,
        name: current?.name ?? "مرفق",
      }));
      toast.success("تم رفع المرفق وسيُحفظ مع الإدخال مباشرة");
    },
    onError: error => toast.error(error.message),
  });
  const selectAttachment = (file?: File) => {
    if (!file) return;
    if (!/[.](pdf|jpe?g|png|webp)$/i.test(file.name))
      return toast.error("اختر مرفقاً بصيغة PDF أو JPG أو PNG أو WEBP");
    if (file.size > 8 * 1024 * 1024)
      return toast.error("يجب ألا يزيد حجم المرفق على 8 ميغابايت");
    const reader = new FileReader();
    reader.onload = () =>
      uploadAttachment.mutate({ dataUrl: String(reader.result) });
    setAttachment({ url: "", key: "", name: file.name });
    reader.readAsDataURL(file);
  };
  const post = trpc.accounting.postDailyEntry.useMutation({
    onSuccess: async () => {
      toast.success(
        isEnglish ? "Entry posted" : "تم ترحيل الإدخال إلى دفتر اليومية"
      );
      await Promise.all([
        utils.accounting.dailyEntries.invalidate(),
        utils.accounting.journals.invalidate(),
        utils.accounting.overview.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const [importRows, setImportRows] = useState<Total9ImportRow[]>([]);
  const [selectedImportSheets, setSelectedImportSheets] = useState<string[]>(
    []
  );
  const [excludedImportRowKeys, setExcludedImportRowKeys] = useState<string[]>(
    []
  );
  const [importEdits, setImportEdits] = useState<
    Record<string, Partial<Total9ImportRow>>
  >({});
  const [importAutoPost] = useState(true);
  const [importMappings, setImportMappings] = useState<
    Record<
      string,
      {
        debitAccountId: string;
        creditAccountId: string;
        entryType: Total9ImportRow["entryType"];
      }
    >
  >({});
  const importTotal9 = trpc.accounting.importTotal9.useMutation({
    onSuccess: async result => {
      toast.success(
        `تم استيراد ${result.imported} صف${result.posted ? ` وترحيل ${result.posted}` : " كمسودات"}${result.skipped ? ` وتجاوز ${result.skipped}` : ""}`
      );
      setImportRows([]);
      await Promise.all([
        utils.accounting.dailyEntries.invalidate(),
        utils.accounting.dailyCashSummary.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const selectTotal9File = (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name))
      return toast.error("اختر ملف Excel بصيغة XLSX أو XLS أو CSV");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = await parseTotal9Workbook(reader.result as ArrayBuffer);
        if (!parsed.length)
          return toast.error("لم يتم العثور على جدول بتاريخ ومبلغ داخل الملف");
        setImportRows(parsed);
        setExcludedImportRowKeys([]);
        setImportEdits({});
        setSelectedImportSheets(
          Array.from(new Set(parsed.map(row => row.sourceSheet)))
        );
        setImportMappings(current => {
          const sheets = Array.from(
            new Set(parsed.map(row => row.sourceSheet))
          );
          return Object.fromEntries(
            sheets.map(sheet => [
              sheet,
              current[sheet] ?? {
                debitAccountId: "",
                creditAccountId: "",
                entryType:
                  parsed.find(row => row.sourceSheet === sheet)?.entryType ??
                  "expense",
              },
            ])
          );
        });
        toast.success(
          `تمت معاينة ${parsed.length} صفاً؛ اختر الحسابين ثم اضغط الاستيراد`
        );
      } catch {
        toast.error("تعذر قراءة ملف TOTAL9؛ تأكد أنه ملف Excel سليم");
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const submit = () => {
    const amountNumber = Number(amount);
    const amountMinor = Math.round(
      amountNumber * (currencyCode === "USD" ? 100 : 1)
    );
    if (!description.trim())
      return toast.error(
        isEnglish ? "Description is required" : "البيان مطلوب"
      );
    if (!Number.isFinite(amountNumber) || amountNumber <= 0)
      return toast.error(
        isEnglish ? "Enter a positive amount" : "أدخل قيمة موجبة"
      );
    if (!debitAccountId || !creditAccountId)
      return toast.error(
        isEnglish
          ? "Select debit and credit accounts"
          : "اختر الحساب المدين والدائن"
      );
    create.mutate({
      entryDate: new Date(`${entryDate}T12:00:00Z`),
      entryType,
      voucherNumber: voucherNumber.trim() || undefined,
      description,
      category: category.trim() || undefined,
      note: note || undefined,
      currencyCode,
      marketExchangeRate:
        currencyCode === "USD" ? 1 : Number(marketExchangeRate),
      amountMinor,
      debitAccountId: Number(debitAccountId),
      creditAccountId: Number(creditAccountId),
      paymentAccountId: paymentAccountId ? Number(paymentAccountId) : undefined,
      costCenterId: costCenterId ? Number(costCenterId) : undefined,
      customerPartnerId: customerPartnerId
        ? Number(customerPartnerId)
        : undefined,
      supplierPartnerId: supplierPartnerId
        ? Number(supplierPartnerId)
        : undefined,
      attachmentUrl: attachment?.url || undefined,
      attachmentKey: attachment?.key || undefined,
    });
  };
  const updateQuickRow = (index: number, patch: Partial<QuickRow>) =>
    setQuickRows(rows =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  const saveQuickRows = async () => {
    const validRows = quickRows.filter(
      row =>
        row.description.trim() &&
        Number(row.amount) > 0 &&
        row.debit &&
        row.credit
    );
    if (!validRows.length)
      return toast.error(
        isEnglish ? "Complete at least one row" : "أكمل صفاً واحداً على الأقل"
      );
    try {
      for (const row of validRows)
        await create.mutateAsync({
          entryDate: new Date(`${row.date}T12:00:00Z`),
          entryType: row.type,
          voucherNumber: row.voucher.trim() || undefined,
          description: row.description.trim(),
          currencyCode: row.currency,
          marketExchangeRate:
            row.currency === "USD" ? 1 : Number(marketExchangeRate) || 1570,
          amountMinor: Math.round(
            Number(row.amount) * (row.currency === "USD" ? 100 : 1)
          ),
          debitAccountId: Number(row.debit),
          creditAccountId: Number(row.credit),
          paymentAccountId: row.paymentAccount
            ? Number(row.paymentAccount)
            : undefined,
          costCenterId: row.costCenter ? Number(row.costCenter) : undefined,
          customerPartnerId: row.customer ? Number(row.customer) : undefined,
          supplierPartnerId: row.supplier ? Number(row.supplier) : undefined,
        });
      toast.success(
        isEnglish
          ? `${validRows.length} rows saved`
          : `تم حفظ ${validRows.length} صفوف وترحيلها مباشرة`
      );
      setQuickRows([blankQuickRow()]);
      await utils.accounting.dailyEntries.invalidate();
    } catch {
      /* mutation displays the server error */
    }
  };
  const parsePastedRows = () => {
    const parsed = pasteRows
      .split(/\r?\n/)
      .map(line => line.split("\t"))
      .filter(columns => columns.some(Boolean));
    if (!parsed.length) return toast.error("الصق صفوفاً مفصولة بعلامة Tab");
    setQuickRows(
      parsed.map(columns => ({
        ...blankQuickRow(),
        date: /^\d{4}-\d{2}-\d{2}$/.test(columns[0]?.trim() ?? "")
          ? columns[0].trim()
          : new Date().toISOString().slice(0, 10),
        description: columns[1]?.trim() ?? "",
        amount: columns[2]?.trim() ?? "",
        currency: columns[3]?.trim().toUpperCase() === "IQD" ? "IQD" : "USD",
      }))
    );
    setPasteRows("");
    toast.success(`تمت إضافة ${parsed.length} صف إلى الجدول`);
  };
  const accountOptions = accounts.data ?? [];
  const filteredEntries = (entries.data ?? []).filter(entry => {
    const date = new Date(entry.entryDate).toISOString().slice(0, 10);
    const accountText =
      `${entry.debitAccountCode} ${entry.debitAccountName} ${entry.creditAccountCode} ${entry.creditAccountName}`.toLowerCase();
    const searchableText =
      `${entry.voucherNumber ?? ""} ${entry.category ?? ""} ${entry.description} ${entry.customerPartnerName ?? ""} ${entry.supplierPartnerName ?? ""}`.toLowerCase();
    const value =
      Number(entry.amountMinor) / (entry.currencyCode === "USD" ? 100 : 1);
    return (
      (!dailyFilter.start || date >= dailyFilter.start) &&
      (!dailyFilter.end || date <= dailyFilter.end) &&
      (dailyFilter.type === "all" || entry.entryType === dailyFilter.type) &&
      (!dailyFilter.account ||
        accountText.includes(dailyFilter.account.toLowerCase())) &&
      (!dailyFilter.search ||
        searchableText.includes(dailyFilter.search.toLowerCase().trim())) &&
      (dailyFilter.status === "all" || entry.status === dailyFilter.status) &&
      (!dailyFilter.min || value >= Number(dailyFilter.min)) &&
      (!dailyFilter.max || value <= Number(dailyFilter.max))
    );
  });
  const groupedDailyEntries = Array.from(
    filteredEntries
      .reduce((groups, entry) => {
        const key = entry.description.trim().toLocaleLowerCase();
        const current = groups.get(key) ?? {
          description: entry.description.trim(),
          count: 0,
          totalUsdMinor: 0,
          totalIqdMinor: 0,
        };
        current.count += 1;
        if (entry.currencyCode === "USD") {
          const usdMinor = Number(entry.amountMinor);
          current.totalUsdMinor += usdMinor;
          current.totalIqdMinor +=
            (usdMinor / 100) * Number(entry.marketExchangeRate ?? 1570);
        } else {
          current.totalIqdMinor += Number(entry.amountMinor);
          current.totalUsdMinor += Number(entry.baseAmountMinor ?? 0);
        }
        groups.set(key, current);
        return groups;
      }, new Map<string, { description: string; count: number; totalUsdMinor: number; totalIqdMinor: number }>())
      .values()
  );
  const defaultDebitAccountId =
    debitAccountId ||
    String(accountOptions.find(account => account.code === "6100")?.id ?? "");
  const defaultCreditAccountId =
    creditAccountId ||
    String(accountOptions.find(account => account.code === "1110")?.id ?? "");
  const total9Sheets = Array.from(
    new Set(importRows.map(row => row.sourceSheet))
  );
  const importRowKey = (row: Total9ImportRow) =>
    [
      row.entryDate.toISOString(),
      row.entryType,
      row.voucherNumber ?? "",
      row.description.trim().toLocaleLowerCase(),
      row.currencyCode,
      row.amountMinor,
    ].join("|");
  const effectiveImportRows = importRows.map((row, index) => ({
    ...row,
    ...(importEdits[String(index)] ?? {}),
  }));
  const seenImportRows = new Set<string>();
  const uniqueImportRows = effectiveImportRows.filter((row, index) => {
    const key = importRowKey(row);
    if (seenImportRows.has(key)) return false;
    seenImportRows.add(key);
    return (
      selectedImportSheets.includes(row.sourceSheet) &&
      !excludedImportRowKeys.includes(String(index))
    );
  });
  const duplicateImportCount =
    importRows.length - new Set(importRows.map(importRowKey)).size;
  const importEntryTypes: Array<[Total9ImportRow["entryType"], string]> = [
    ["expense", "مصروف"],
    ["receipt", "قبض"],
    ["payment", "صرف"],
    ["transfer", "تحويل"],
    ["adjustment", "تسوية"],
  ];
  const entryTypes = isEnglish
    ? ([
        ["expense", "Expense"],
        ["receipt", "Receipt"],
        ["payment", "Payment"],
        ["transfer", "Transfer"],
        ["adjustment", "Adjustment"],
      ] as const)
    : ([
        ["expense", "مصروف"],
        ["receipt", "قبض"],
        ["payment", "صرف"],
        ["transfer", "تحويل"],
        ["adjustment", "تسوية"],
      ] as const);
  const money = (value: number, currency: string) =>
    new Intl.NumberFormat(isEnglish ? "en-US" : "ar-IQ", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      maximumFractionDigits: currency === "IQD" ? 0 : 2,
    }).format(value / (currency === "USD" ? 100 : 1));
  const cashReportSections: ReportSection[] = [
    {
      title: `ملخص صندوق اليومية — ${cashDate}`,
      columns: [
        "الصندوق / المصرف",
        "العملة",
        "الرصيد الافتتاحي",
        "المقبوضات",
        "المصروفات",
        "المتبقي",
      ],
      rows: (cashSummary.data?.accounts ?? []).map(account => [
        account.accountName,
        account.currencyCode,
        money(account.openingMinor, account.currencyCode),
        money(account.receiptMinor, account.currencyCode),
        money(account.spentMinor, account.currencyCode),
        money(account.closingMinor, account.currencyCode),
      ]),
    },
    {
      title: "تفاصيل الحركات النقدية",
      columns: [
        "التاريخ",
        "البيان",
        "النوع",
        "القيمة",
        "الحساب المدين",
        "الحساب الدائن",
        "المستخدم",
        "الحالة",
      ],
      rows: (
        cashSummary.data?.accounts.flatMap(account => account.entries) ?? []
      ).map(entry => [
        formatDateTime(entry.createdAt, isEnglish ? "en" : "ar"),
        entry.description,
        entry.entryType === "receipt" ? "قبض" : "مصروف / صرف",
        money(Number(entry.amountMinor), entry.currencyCode),
        entry.debitAccountName,
        entry.creditAccountName,
        entry.createdByName,
        entry.status === "posted"
          ? "مرحّل"
          : entry.status === "pendingApproval"
            ? "بانتظار الاعتماد"
            : "مسودة",
      ]),
    },
    {
      title: `مطابقة الصندوق — ${cashDate}`,
      columns: ["الرصيد المسجل", "الرصيد الفعلي", "الفرق", "النتيجة"],
      rows: [
        [
          money(cashRecordedClosingMinor, cashCurrency),
          cashActualMinor === null ? "—" : money(cashActualMinor, cashCurrency),
          cashReconciliationDifferenceMinor === null
            ? "—"
            : money(cashReconciliationDifferenceMinor, cashCurrency),
          cashReconciliationDifferenceMinor === null
            ? "لم يُدخل الرصيد الفعلي"
            : cashReconciliationDifferenceMinor === 0
              ? "مطابق"
              : cashReconciliationDifferenceMinor > 0
                ? "زيادة فعلية"
                : "عجز فعلي",
        ],
      ],
    },
  ];
  const cashPeriodReportSections: ReportSection[] = [
    {
      title: `تقرير النقدية من ${cashPeriodFromDate} إلى ${cashPeriodToDate}`,
      columns: [
        "العملة",
        "الرصيد الافتتاحي",
        "المقبوضات",
        "المصروفات",
        "المتبقي",
      ],
      rows: cashPeriodReport.data
        ? [
            [
              cashPeriodReport.data.currencyCode,
              money(cashPeriodReport.data.totals.openingMinor, cashCurrency),
              money(cashPeriodReport.data.totals.receiptMinor, cashCurrency),
              money(cashPeriodReport.data.totals.spentMinor, cashCurrency),
              money(cashPeriodReport.data.totals.closingMinor, cashCurrency),
            ],
          ]
        : [],
    },
    {
      title: "التفاصيل فاتورة / وصل",
      columns: [
        "التاريخ",
        "رقم الوصل",
        "البيان",
        "الفئة",
        "النوع",
        "المبلغ",
        "الحساب المدين",
        "الحساب الدائن",
      ],
      rows: (cashPeriodReport.data?.entries ?? []).map(entry => [
        formatDateTime(entry.createdAt, isEnglish ? "en" : "ar"),
        entry.voucherNumber ?? "—",
        entry.description,
        entry.category ?? "—",
        entry.entryType === "receipt" ? "قبض" : "مصروف / صرف",
        money(Number(entry.amountMinor), cashCurrency),
        entry.debitAccountName,
        entry.creditAccountName,
      ]),
    },
    {
      title: "الرصيد حسب اليوم",
      columns: ["التاريخ", "المقبوضات", "المصروفات", "المتبقي"],
      rows: (cashPeriodReport.data?.daily ?? []).map(day => [
        day.date,
        money(day.receipts, cashCurrency),
        money(day.spent, cashCurrency),
        money(day.closing, cashCurrency),
      ]),
    },
  ];
  return (
    <section className="space-y-5">
      {(canCreate || canPost) && (
        <article className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm dark:border-amber-950 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-700">صندوق اليومية</p>
              <h3 className="text-xl font-black">
                المقبوضات والمصروفات والرصيد
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                سجّل المبلغ المستلم أولاً، ثم اربط كل مصروف بالصندوق ليظهر أين
                انصرف وما بقي منه.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="rounded-2xl bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  الرصيد الافتتاحي
                </div>
                <strong>
                  {money(
                    cashSummary.data?.totals.openingMinor ?? 0,
                    cashCurrency
                  )}
                </strong>
              </div>
              <div className="rounded-2xl bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">
                  المقبوضات
                </div>
                <strong className="text-emerald-700">
                  {money(
                    cashSummary.data?.totals.receiptMinor ?? 0,
                    cashCurrency
                  )}
                </strong>
              </div>
              <div className="rounded-2xl bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">المصروف</div>
                <strong className="text-rose-700">
                  {money(
                    cashSummary.data?.totals.spentMinor ?? 0,
                    cashCurrency
                  )}
                </strong>
              </div>
              <div className="rounded-2xl bg-background px-3 py-2">
                <div className="text-[11px] text-muted-foreground">المتبقي</div>
                <strong className="text-blue-700">
                  {money(
                    cashSummary.data?.totals.closingMinor ?? 0,
                    cashCurrency
                  )}
                </strong>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-amber-200 pt-4 dark:border-amber-900">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportReportToExcel(
                  `daily-cash-${cashDate}`,
                  `تقرير صندوق اليومية — ${cashDate}`,
                  cashReportSections
                )
              }
            >
              تصدير تقرير الصندوق Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (
                  !printReportToPdf(
                    `تقرير صندوق اليومية — ${cashDate}`,
                    cashReportSections
                  )
                )
                  toast.error("اسمح بفتح نافذة التقرير لإكمال تصدير PDF");
              }}
            >
              تصدير تقرير الصندوق PDF
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-950 dark:bg-blue-950/20">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1.5 text-sm font-bold">
                تقرير من تاريخ
                <input
                  type="date"
                  value={cashPeriodFromDate}
                  onChange={event => setCashPeriodFromDate(event.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold">
                إلى تاريخ
                <input
                  type="date"
                  value={cashPeriodToDate}
                  onChange={event => setCashPeriodToDate(event.target.value)}
                  className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const today = todayDateKey();
                    setCashPeriodFromDate(today);
                    setCashPeriodToDate(today);
                  }}
                >
                  اليوم
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCashPeriodFromDate(startOfWeekDateKey());
                    setCashPeriodToDate(todayDateKey());
                  }}
                >
                  هذا الأسبوع
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCashPeriodFromDate(startOfMonthDateKey());
                    setCashPeriodToDate(todayDateKey());
                  }}
                >
                  هذا الشهر
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setCashPeriodFromDate(startOfPreviousMonthDateKey());
                    setCashPeriodToDate(endOfPreviousMonthDateKey());
                  }}
                >
                  الشهر الماضي
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!cashPeriodReport.data}
                  onClick={() =>
                    exportReportToExcel(
                      `cash-report-${cashPeriodFromDate}-${cashPeriodToDate}`,
                      `تقرير النقدية ${cashPeriodFromDate} إلى ${cashPeriodToDate}`,
                      cashPeriodReportSections
                    )
                  }
                >
                  تصدير الفترة Excel
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!cashPeriodReport.data}
                  onClick={() => {
                    if (
                      !printReportToPdf(
                        `تقرير النقدية ${cashPeriodFromDate} إلى ${cashPeriodToDate}`,
                        cashPeriodReportSections
                      )
                    )
                      toast.error("اسمح بفتح نافذة التقرير لإكمال تصدير PDF");
                  }}
                >
                  تصدير الفترة PDF
                </Button>
              </div>
            </div>
            {(!dateKeyPattern.test(cashPeriodFromDate) ||
              !dateKeyPattern.test(cashPeriodToDate)) && (
              <p className="mt-3 text-sm font-bold text-rose-700">
                أدخل التاريخين بصيغة صحيحة: سنة-شهر-يوم.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              يعرض المبلغ المستلم، كل المصروفات والوصولات بالتفصيل، والرصيد
              المتبقي حسب العملة المختارة.
            </p>
            {safeCashPeriodFromDate > safeCashPeriodToDate ? (
              <p className="mt-3 text-sm font-bold text-rose-700">
                تاريخ البداية يجب أن يسبق تاريخ النهاية.
              </p>
            ) : cashPeriodReport.isLoading ? (
              <p className="mt-3 text-sm text-muted-foreground">
                جارٍ إعداد تقرير الفترة…
              </p>
            ) : cashPeriodReport.error ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <span>
                  تعذر تحميل تقرير النقدية. {cashPeriodReport.error.message}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cashPeriodReport.refetch()}
                >
                  إعادة المحاولة
                </Button>
              </div>
            ) : cashPeriodReport.data ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">المستلم</div>
                  <strong className="text-emerald-700">
                    {money(
                      cashPeriodReport.data.totals.receiptMinor,
                      cashCurrency
                    )}
                  </strong>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">المنصرف</div>
                  <strong className="text-rose-700">
                    {money(
                      cashPeriodReport.data.totals.spentMinor,
                      cashCurrency
                    )}
                  </strong>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">المتبقي</div>
                  <strong className="text-blue-700">
                    {money(
                      cashPeriodReport.data.totals.closingMinor,
                      cashCurrency
                    )}
                  </strong>
                </div>
                <div className="rounded-xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">
                    عدد التفاصيل
                  </div>
                  <strong>{cashPeriodReport.data.entries.length}</strong>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-950 dark:bg-blue-950/20">
            <label className="grid min-w-[220px] flex-1 gap-1.5 text-sm font-bold">
              الرصيد الفعلي الموجود بالصندوق
              <input
                inputMode="decimal"
                value={cashActualAmount}
                onChange={event => setCashActualAmount(event.target.value)}
                placeholder={cashCurrency === "USD" ? "0.00" : "0"}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <div className="min-w-[220px] text-sm">
              <div className="text-muted-foreground">نتيجة المطابقة</div>
              <strong
                className={
                  cashReconciliationDifferenceMinor === null
                    ? "text-muted-foreground"
                    : cashReconciliationDifferenceMinor === 0
                      ? "text-emerald-700"
                      : "text-rose-700"
                }
              >
                {cashReconciliationDifferenceMinor === null
                  ? "أدخل الرصيد الفعلي للمقارنة"
                  : cashReconciliationDifferenceMinor === 0
                    ? "مطابق تماماً"
                    : `${cashReconciliationDifferenceMinor > 0 ? "زيادة" : "عجز"}: ${money(Math.abs(cashReconciliationDifferenceMinor), cashCurrency)}`}
              </strong>
            </div>
            {canCarryCashForward &&
              cashAccountId &&
              cashActualMinor !== null &&
              !cashCurrencyMismatch && (
                <Button
                  size="sm"
                  disabled={saveCashReconciliation.isPending}
                  onClick={() =>
                    saveCashReconciliation.mutate({
                      date: cashDate,
                      paymentAccountId: Number(cashAccountId),
                      currencyCode: cashCurrency,
                      actualClosingMinor: cashActualMinor,
                      note: cashReconciliationNote.trim() || undefined,
                    })
                  }
                >
                  حفظ المطابقة
                </Button>
              )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              value={cashReconciliationNote}
              onChange={event => setCashReconciliationNote(event.target.value)}
              placeholder="ملاحظة المطابقة، مثلاً تم العد بحضور المدير"
              className="h-10 min-w-[260px] flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            />
            <span className="text-xs text-muted-foreground">
              سجل المطابقات يحفظ آخر 90 مطابقة للصندوق المختار.
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-bold">
              التاريخ
              <input
                type="date"
                value={cashDate}
                onChange={event => setCashDate(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              الصندوق / المصرف
              <select
                value={cashAccountId}
                onChange={event => setCashAccountId(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">اختر الصندوق</option>
                {(paymentAccounts.data ?? []).map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name} —{" "}
                    {account.isMultiCurrency
                      ? "متعدد العملات"
                      : account.currencyCode}
                  </option>
                ))}
              </select>
              {paymentAccounts.isLoading ? (
                <span className="text-xs font-normal text-muted-foreground">
                  جارٍ تحميل الصناديق…
                </span>
              ) : paymentAccounts.error ? (
                <span className="text-xs font-normal text-rose-700">
                  تعذر تحميل الصناديق. أعد تحميل الصفحة.
                </span>
              ) : paymentAccounts.data?.length === 0 ? (
                <span className="text-xs font-normal text-amber-700">
                  لم يوجد صندوق فعال؛ سيتم إنشاء الصندوق الرئيسي تلقائياً.
                </span>
              ) : null}
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              عملة القبض
              <select
                value={cashCurrency}
                onChange={event =>
                  setCashCurrency(event.target.value as "USD" | "IQD")
                }
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="IQD">دينار عراقي (IQD)</option>
                <option value="USD">دولار أمريكي (USD)</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              مبلغ مستلم
              <input
                inputMode="decimal"
                value={cashAmount}
                onChange={event => setCashAmount(event.target.value)}
                placeholder={cashCurrency === "USD" ? "0.00" : "0"}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              الحساب المقابل
              <select
                value={cashContraAccountId}
                onChange={event => setCashContraAccountId(event.target.value)}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">اختر الحساب</option>
                {accountOptions.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {cashCurrencyMismatch && (
            <p className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
              عملة القبض لا تطابق عملة الصندوق المختار. اختر صندوقاً بعملة{" "}
              {cashCurrency} أو غيّر العملة قبل التسجيل.
            </p>
          )}
          <div className="mt-3 flex flex-col gap-3 md:flex-row">
            <input
              value={cashDescription}
              onChange={event => setCashDescription(event.target.value)}
              placeholder="مصدر القبض أو البيان، مثلاً مبيعات اليوم"
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            />
            <input
              value={cashReceiptNote}
              onChange={event => setCashReceiptNote(event.target.value)}
              placeholder="اسم العامل أو المستلم / ملاحظة"
              className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            />
            {canCreate && (
              <Button
                disabled={createCashReceipt.isPending || cashCurrencyMismatch}
                onClick={() => {
                  const amountNumber = Number(cashAmount);
                  if (
                    !selectedCashAccount ||
                    !cashContraAccountId ||
                    !cashDescription.trim() ||
                    !Number.isFinite(amountNumber) ||
                    amountNumber <= 0
                  )
                    return toast.error(
                      "اختر الصندوق والحساب المقابل وأدخل مبلغاً وبياناً صحيحاً"
                    );
                  createCashReceipt.mutate({
                    entryDate: new Date(`${cashDate}T12:00:00Z`),
                    entryType: "receipt",
                    description: cashDescription.trim(),
                    note: cashReceiptNote.trim() || undefined,
                    category: "مقبوضات يومية",
                    currencyCode: cashCurrency,
                    marketExchangeRate:
                      cashCurrency === "USD"
                        ? 1
                        : Number(dailyRate.data?.marketExchangeRate ?? 1570),
                    amountMinor: Math.round(
                      amountNumber * (cashCurrency === "USD" ? 100 : 1)
                    ),
                    debitAccountId: selectedCashAccount.accountId,
                    creditAccountId: Number(cashContraAccountId),
                    paymentAccountId: selectedCashAccount.id,
                  });
                }}
              >
                تسجيل المقبوضات
              </Button>
            )}
            {canCarryCashForward && cashAccountId && !cashCurrencyMismatch && (
              <Button
                variant="outline"
                disabled={carryForwardCash.isPending}
                onClick={() =>
                  carryForwardCash.mutate({
                    date: cashDate,
                    paymentAccountId: Number(cashAccountId),
                    currencyCode: cashCurrency,
                  })
                }
              >
                ترحيل المتبقي لليوم التالي
              </Button>
            )}
          </div>
          <div className="mt-4 overflow-auto rounded-2xl border border-amber-200 bg-background">
            <table className="w-full min-w-[850px] text-right text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">البيان</th>
                  <th className="p-2">النوع</th>
                  <th className="p-2">القيمة</th>
                  <th className="p-2">المستخدم / العامل</th>
                  <th className="p-2">الملاحظة</th>
                  <th className="p-2">الحالة</th>
                  <th className="p-2">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {(
                  cashSummary.data?.accounts.flatMap(
                    account => account.entries
                  ) ?? []
                ).map(entry => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="p-2">
                      {formatDateTime(entry.createdAt, isEnglish ? "en" : "ar")}
                    </td>
                    <td className="p-2 font-bold">{entry.description}</td>
                    <td className="p-2">
                      {entry.entryType === "receipt" ? "قبض" : "مصروف / صرف"}
                    </td>
                    <td className="p-2 font-black">
                      {money(Number(entry.amountMinor), entry.currencyCode)}
                    </td>
                    <td className="p-2">{entry.createdByName}</td>
                    <td className="max-w-[260px] truncate p-2">{entry.note || "—"}</td>
                    <td className="p-2">
                      {entry.status === "posted"
                        ? "مرحّل"
                        : entry.status === "pendingApproval"
                          ? "بانتظار الاعتماد"
                          : "مسودة"}
                    </td>
                    <td className="p-2">
                      {entry.status === "posted" ? "مسجل" : "يحتاج مراجعة بيانات"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!cashSummary.data?.accounts.some(
              account => account.entries.length
            ) && (
              <p className="p-5 text-center text-xs text-muted-foreground">
                لا توجد حركة نقدية في هذا اليوم بعد.
              </p>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-blue-200 bg-background p-3 dark:border-blue-950">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-black">سجل مطابقات الصندوق</h4>
                <p className="text-xs text-muted-foreground">
                  للرجوع الشهري إلى الرصيد المسجل والعد الفعلي والفروقات.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {cashReconciliationHistory.data?.length ?? 0} مطابقة محفوظة
              </span>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[760px] text-right text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2">التاريخ</th>
                    <th className="p-2">الصندوق</th>
                    <th className="p-2">المسجل</th>
                    <th className="p-2">الفعلي</th>
                    <th className="p-2">الفرق</th>
                    <th className="p-2">النتيجة</th>
                    <th className="p-2">الملاحظة</th>
                    <th className="p-2">المستخدم</th>
                  </tr>
                </thead>
                <tbody>
                  {(cashReconciliationHistory.data ?? []).map(record => (
                    <tr key={record.id} className="border-t border-border">
                      <td className="p-2 font-bold">
                        {record.reconciliationDate}
                      </td>
                      <td className="p-2">
                        {record.paymentAccountName} — {record.currencyCode}
                      </td>
                      <td className="p-2">
                        {money(
                          record.recordedClosingMinor,
                          record.currencyCode
                        )}
                      </td>
                      <td className="p-2">
                        {money(record.actualClosingMinor, record.currencyCode)}
                      </td>
                      <td className="p-2 font-black">
                        {money(
                          Math.abs(record.differenceMinor),
                          record.currencyCode
                        )}
                      </td>
                      <td
                        className={
                          record.differenceMinor === 0
                            ? "p-2 font-bold text-emerald-700"
                            : "p-2 font-bold text-rose-700"
                        }
                      >
                        {record.differenceMinor === 0
                          ? "مطابق"
                          : record.differenceMinor > 0
                            ? "زيادة"
                            : "عجز"}
                      </td>
                      <td className="max-w-[220px] truncate p-2">
                        {record.note || "—"}
                      </td>
                      <td className="p-2">{record.createdByName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cashReconciliationHistory.isLoading &&
                !cashReconciliationHistory.data?.length && (
                  <p className="p-5 text-center text-xs text-muted-foreground">
                    لا توجد مطابقات محفوظة لهذا الصندوق بعد.
                  </p>
                )}
            </div>
          </div>
        </article>
      )}
      {canCreate && (
        <article className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-700">
                إدخال يومي سريع
              </p>
              <h3 className="text-xl font-black">جدول العمليات اليومية</h3>
              <p className="text-xs text-muted-foreground">
                أضف عدة صفوف واحفظها مباشرة مثل جدول TOTAL9. الحقول الإضافية اختيارية.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setQuickRows(rows => [...rows, blankQuickRow()])}
              >
                + صف جديد
              </Button>
              <Button
                size="sm"
                onClick={saveQuickRows}
                disabled={create.isPending}
              >
                حفظ الصفوف
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[1100px] text-right text-xs">
              <thead className="bg-background text-muted-foreground">
                <tr>
                  <th className="p-2">التاريخ</th>
                  <th className="p-2">رقم الوصل</th>
                  <th className="p-2">نوع العملية</th>
                  <th className="p-2">البيان</th>
                  <th className="p-2">المبلغ</th>
                  <th className="p-2">العملة</th>
                  <th className="p-2">الصندوق / المصرف</th>
                  <th className="p-2">المدين</th>
                  <th className="p-2">الدائن</th>
                  <th className="p-2">مركز التكلفة</th>
                  <th className="p-2">العميل</th>
                  <th className="p-2">المورد</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quickRows.map((row, index) => (
                  <tr key={index} className="border-t border-emerald-200/70">
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={event =>
                          updateQuickRow(index, { date: event.target.value })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.voucher}
                        onChange={event =>
                          updateQuickRow(index, { voucher: event.target.value })
                        }
                        placeholder="اختياري"
                        className="h-9 w-28 rounded-lg border border-input bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={row.type}
                        onChange={event =>
                          updateQuickRow(index, {
                            type: event.target.value as QuickRow["type"],
                          })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="expense">مصروف</option>
                        <option value="receipt">قبض</option>
                        <option value="payment">صرف</option>
                        <option value="transfer">تحويل</option>
                        <option value="adjustment">تسوية</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        value={row.description}
                        onChange={event =>
                          updateQuickRow(index, {
                            description: event.target.value,
                          })
                        }
                        placeholder="البيان"
                        className="h-9 w-44 rounded-lg border border-input bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        inputMode="decimal"
                        value={row.amount}
                        onChange={event =>
                          updateQuickRow(index, { amount: event.target.value })
                        }
                        className="h-9 w-28 rounded-lg border border-input bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={row.currency}
                        onChange={event =>
                          updateQuickRow(index, {
                            currency: event.target
                              .value as QuickRow["currency"],
                          })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-2"
                      >
                        <option>USD</option>
                        <option>IQD</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.paymentAccount}
                        onChange={event =>
                          updateQuickRow(index, {
                            paymentAccount: event.target.value,
                          })
                        }
                        className="h-9 w-40 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {(paymentAccounts.data ?? [])
                          .filter(
                            account => account.currencyCode === row.currency
                          )
                          .map(account => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.debit}
                        onChange={event =>
                          updateQuickRow(index, { debit: event.target.value })
                        }
                        className="h-9 w-40 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {accountOptions.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.credit}
                        onChange={event =>
                          updateQuickRow(index, { credit: event.target.value })
                        }
                        className="h-9 w-40 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {accountOptions.map(account => (
                          <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.costCenter}
                        onChange={event =>
                          updateQuickRow(index, {
                            costCenter: event.target.value,
                          })
                        }
                        className="h-9 w-32 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {(costCenters.data ?? []).map(center => (
                          <option key={center.id} value={center.id}>
                            {center.code} — {center.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.customer}
                        onChange={event =>
                          updateQuickRow(index, {
                            customer: event.target.value,
                          })
                        }
                        className="h-9 w-32 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {(customers.data ?? []).map(partner => (
                          <option key={partner.id} value={partner.id}>
                            {partner.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <select
                        value={row.supplier}
                        onChange={event =>
                          updateQuickRow(index, {
                            supplier: event.target.value,
                          })
                        }
                        className="h-9 w-32 rounded-lg border border-input bg-background px-2"
                      >
                        <option value="">اختياري</option>
                        {(suppliers.data ?? []).map(partner => (
                          <option key={partner.id} value={partner.id}>
                            {partner.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setQuickRows(rows =>
                            rows.length > 1
                              ? rows.filter((_, rowIndex) => rowIndex !== index)
                              : [blankQuickRow()]
                          )
                        }
                      >
                        حذف
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
            <textarea
              value={pasteRows}
              onChange={event => setPasteRows(event.target.value)}
              placeholder="الصق من Excel: التاريخ ثم البيان ثم المبلغ ثم العملة، وبين كل عمود وآخر Tab"
              rows={2}
              className="rounded-xl border border-input bg-background px-3 py-2 text-xs"
            />
            <Button variant="outline" onClick={parsePastedRows}>
              تحويل اللصق إلى صفوف
            </Button>
          </div>
        </article>
      )}
      {canCreate && (
        <article className="rounded-3xl border border-blue-200 bg-[linear-gradient(135deg,#f8fbff,#eff6ff)] p-6 shadow-sm dark:border-blue-950 dark:bg-[linear-gradient(135deg,#0b1931,#102647)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                {isEnglish
                  ? "Fast double-entry capture"
                  : "إدخال محاسبي سريع ومزدوج"}
              </p>
              <h3 className="mt-1 text-2xl font-black">
                {isEnglish ? "Daily voucher" : "سند يومي"}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                {isEnglish
                  ? "Save flexible TOTAL9-style transactions as drafts. A manager posts them into the official journal after review."
                  : "سجّل المصروفات والمقبوضات والتحويلات بسرعة كمسودات مرنة على نمط TOTAL9، ثم يرحّلها المدير إلى دفتر اليومية بعد المراجعة."}
              </p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-700 text-white">
              <FilePlus2 className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Date" : "التاريخ"}
              <input
                type="date"
                value={entryDate}
                onChange={event => setEntryDate(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Voucher no. (optional)" : "رقم الوصل (اختياري)"}
              <input
                value={voucherNumber}
                onChange={event => setVoucherNumber(event.target.value)}
                placeholder="رقم الوصل أو الفاتورة"
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Type" : "نوع العملية"}
              <select
                value={entryType}
                onChange={event =>
                  setEntryType(event.target.value as typeof entryType)
                }
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                {entryTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Amount" : "القيمة"}
              <input
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                placeholder={currencyCode === "USD" ? "0.00" : "0"}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Currency" : "العملة"}
              <select
                value={currencyCode}
                onChange={event => {
                  const next = event.target.value as "USD" | "IQD";
                  setCurrencyCode(next);
                  setMarketExchangeRate(
                    next === "USD"
                      ? "1"
                      : marketExchangeRate === "1"
                        ? "1570"
                        : marketExchangeRate
                  );
                }}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="USD">USD — دولار</option>
                <option value="IQD">IQD — دينار</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Description" : "البيان"}
              <input
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder={
                  isEnglish ? "Fuel, rent, collection…" : "وقود، إيجار، تحصيل…"
                }
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish
                ? "Cash / bank (optional)"
                : "الصندوق / المصرف (اختياري)"}
              <select
                value={paymentAccountId}
                onChange={event => setPaymentAccountId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">بدون ربط بصندوق</option>
                {(paymentAccounts.data ?? [])
                  .filter(account => account.currencyCode === currencyCode)
                  .map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} —{" "}
                      {account.type === "cash" ? "صندوق" : "مصرف"}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Category (optional)" : "الفئة (اختيارية)"}
              <input
                value={category}
                onChange={event => setCategory(event.target.value)}
                placeholder="مصاريف تشغيلية، safety، خضروات، مواد…"
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Debit account" : "الحساب المدين"}
              <select
                value={debitAccountId}
                onChange={event => setDebitAccountId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {isEnglish ? "Select account" : "اختر الحساب"}
                </option>
                {accountOptions.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Credit account" : "الحساب الدائن"}
              <select
                value={creditAccountId}
                onChange={event => setCreditAccountId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {isEnglish ? "Select account" : "اختر الحساب"}
                </option>
                {accountOptions.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.code} — {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Cost centre" : "مركز التكلفة"}
              <select
                value={costCenterId}
                onChange={event => setCostCenterId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {isEnglish ? "No cost centre" : "بدون مركز تكلفة"}
                </option>
                {(costCenters.data ?? []).map(center => (
                  <option key={center.id} value={center.id}>
                    {center.code} — {center.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Customer (optional)" : "العميل (اختياري)"}
              <select
                value={customerPartnerId}
                onChange={event => setCustomerPartnerId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {isEnglish ? "No customer" : "بدون عميل"}
                </option>
                {(customers.data ?? []).map(partner => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Supplier (optional)" : "المورد (اختياري)"}
              <select
                value={supplierPartnerId}
                onChange={event => setSupplierPartnerId(event.target.value)}
                className="h-11 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {isEnglish ? "No supplier" : "بدون مورد"}
                </option>
                {(suppliers.data ?? []).map(partner => (
                  <option key={partner.id} value={partner.id}>
                    {partner.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1.5 text-sm font-bold">
              <label>
                {isEnglish ? "Today's market rate" : "سعر السوق اليومي"}
                <input
                  inputMode="decimal"
                  value={currencyCode === "USD" ? "1" : marketExchangeRate}
                  disabled={currencyCode === "USD"}
                  onChange={event => setMarketExchangeRate(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal disabled:opacity-70"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-normal text-muted-foreground">
                  {currencyCode === "IQD"
                    ? `1 USD = ${dailyRate.data?.marketExchangeRate ?? marketExchangeRate} IQD · يثبت مرة يومياً`
                    : "USD = 1"}
                </span>
                {currencyCode === "IQD" && canCreate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      setDailyRate.isPending || !Number(marketExchangeRate)
                    }
                    onClick={() =>
                      setDailyRate.mutate({
                        currencyCode: "IQD",
                        marketExchangeRate: Number(marketExchangeRate),
                      })
                    }
                  >
                    {setDailyRate.isPending ? "…" : "تثبيت اليوم"}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="grid gap-1.5 text-sm font-bold">
              {isEnglish ? "Note" : "ملاحظة"}
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                rows={2}
                className="rounded-xl border border-input bg-background px-3 py-2 font-normal"
              />
            </label>
            <label className="grid h-11 cursor-pointer place-items-center rounded-xl border border-input bg-background px-4 text-sm font-bold hover:bg-muted">
              {uploadAttachment.isPending
                ? "جارٍ رفع المرفق…"
                : attachment?.url
                  ? `مرفق: ${attachment.name}`
                  : "إرفاق وصل / PDF"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                onChange={event => {
                  selectAttachment(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <Button
              onClick={submit}
              disabled={
                create.isPending ||
                uploadAttachment.isPending ||
                Boolean(attachment && !attachment.url)
              }
              className="h-11 rounded-xl bg-blue-700 font-black hover:bg-blue-800"
            >
              {create.isPending
                ? isEnglish
                  ? "Saving…"
                  : "جارٍ الحفظ…"
                : isEnglish
                  ? "Save and post"
                  : "تسجيل وحفظ مباشرة"}
            </Button>
          </div>
        </article>
      )}
      {canCreate && (
        <article className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm dark:border-amber-950 dark:bg-amber-950/20">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                استيراد تاريخي من TOTAL9
              </p>
              <h3 className="mt-1 text-xl font-black">
                حوّل DAILY والصندوق وبقية الجداول إلى إدخالات مباشرة
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                يقرأ النظام الصفوف التي تحتوي على تاريخ ومبلغ، يحافظ على ورقة
                المصدر ورقم الوصل، ويختار الدينار عند وجود العملتين مع اشتقاق
                سعر السوق، وتُسجّل الصفوف مباشرة في الحركات.
              </p>
            </div>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-amber-300 bg-background px-4 text-sm font-black text-amber-900 hover:bg-amber-100 dark:text-amber-100">
              اختر ملف TOTAL9
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={event => {
                  selectTotal9File(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          {importRows.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-background p-4">
              <p className="text-sm font-black text-amber-900 dark:text-amber-100">
                خريطة الحسابات حسب الفئة / الورقة
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                كل صف في الورقة سيستخدم الحسابين ونوع العملية المحددين هنا.
                يمكنك تعديل كل فئة قبل الاستيراد.
              </p>
              <p className="mt-2 text-xs font-bold text-amber-800">
                المحدد للاستيراد: {uniqueImportRows.length} صف فريد
                {duplicateImportCount
                  ? ` · تم كشف ${duplicateImportCount} تكرار مطابق وسيتم تجاهله`
                  : ""}
                .
              </p>
              <div className="mt-3 space-y-3">
                {total9Sheets.map(sheet => {
                  const mapping = importMappings[sheet] ?? {
                    debitAccountId: defaultDebitAccountId,
                    creditAccountId: defaultCreditAccountId,
                    entryType: "expense" as const,
                  };
                  const updateMapping = (patch: Partial<typeof mapping>) =>
                    setImportMappings(current => ({
                      ...current,
                      [sheet]: { ...mapping, ...patch },
                    }));
                  return (
                    <div
                      key={sheet}
                      className={`rounded-2xl border p-3 ${selectedImportSheets.includes(sheet) ? "border-amber-300 bg-muted/30" : "border-border bg-muted/10 opacity-60"}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 font-black">
                          <input
                            type="checkbox"
                            checked={selectedImportSheets.includes(sheet)}
                            onChange={event =>
                              setSelectedImportSheets(current =>
                                event.target.checked
                                  ? [...current, sheet]
                                  : current.filter(item => item !== sheet)
                              )
                            }
                          />
                          {sheet || "بدون اسم ورقة"}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {
                            importRows.filter(row => row.sourceSheet === sheet)
                              .length
                          }{" "}
                          صف
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="grid gap-1 text-xs font-bold">
                          الحساب المدين
                          <select
                            value={
                              mapping.debitAccountId || defaultDebitAccountId
                            }
                            onChange={event =>
                              updateMapping({
                                debitAccountId: event.target.value,
                              })
                            }
                            className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-normal"
                          >
                            <option value="">اختر الحساب</option>
                            {accountOptions.map(account => (
                              <option key={account.id} value={account.id}>
                                {account.code} — {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-bold">
                          الحساب الدائن
                          <select
                            value={
                              mapping.creditAccountId || defaultCreditAccountId
                            }
                            onChange={event =>
                              updateMapping({
                                creditAccountId: event.target.value,
                              })
                            }
                            className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-normal"
                          >
                            <option value="">اختر الحساب</option>
                            {accountOptions.map(account => (
                              <option key={account.id} value={account.id}>
                                {account.code} — {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-bold">
                          نوع العملية
                          <select
                            value={mapping.entryType}
                            onChange={event =>
                              updateMapping({
                                entryType: event.target
                                  .value as Total9ImportRow["entryType"],
                              })
                            }
                            className="h-9 rounded-lg border border-input bg-background px-2 text-sm font-normal"
                          >
                            {importEntryTypes.map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-100">
                بعد اعتماد المعاينة، تُسجّل الصفوف السليمة مباشرة في الحركات مثل TOTAL9؛ لا تُنشأ مسودات ولا توجد خطوة موافقة إضافية.
              </div>
              <div className="mt-3">
                <Button
                  onClick={() => {
                    const missing = selectedImportSheets.find(
                      sheet =>
                        !(
                          importMappings[sheet]?.debitAccountId ||
                          defaultDebitAccountId
                        ) ||
                        !(
                          importMappings[sheet]?.creditAccountId ||
                          defaultCreditAccountId
                        )
                    );
                    if (missing)
                      return toast.error(`اختر الحسابين لفئة ${missing}`);
                    if (!uniqueImportRows.length)
                      return toast.error(
                        "اختر ورقة واحدة على الأقل وتأكد من وجود صفوف غير مكررة"
                      );
                    importTotal9.mutate({
                      autoPost: importAutoPost,
                      rows: uniqueImportRows.map(row => {
                        const mapping = importMappings[row.sourceSheet] ?? {
                          debitAccountId: defaultDebitAccountId,
                          creditAccountId: defaultCreditAccountId,
                          entryType: row.entryType,
                        };
                        return {
                          ...row,
                          entryType: mapping.entryType,
                          debitAccountId: Number(
                            mapping.debitAccountId || defaultDebitAccountId
                          ),
                          creditAccountId: Number(
                            mapping.creditAccountId || defaultCreditAccountId
                          ),
                        };
                      }),
                    });
                  }}
                  disabled={importTotal9.isPending}
                  className="h-10 w-full rounded-xl bg-amber-700 font-black hover:bg-amber-800"
                >
                  {importTotal9.isPending
                    ? "جارٍ الاستيراد…"
                    : `استيراد وتسجيل ${uniqueImportRows.length} صف فريد`}
                </Button>
              </div>
              <div className="mt-3 overflow-auto">
                <table className="w-full min-w-[720px] text-right text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-2">اختيار</th>
                      <th className="p-2">الورقة</th>
                      <th className="p-2">التاريخ</th>
                      <th className="p-2">البيان</th>
                      <th className="p-2">القيمة</th>
                      <th className="p-2">العملة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {effectiveImportRows.slice(0, 20).map((row, index) => (
                      <tr
                        key={`${row.sourceSheet}-${index}`}
                        className={`border-t border-border ${excludedImportRowKeys.includes(String(index)) ? "opacity-40" : ""}`}
                      >
                        <td className="p-2">
                          <input
                            type="checkbox"
                            checked={
                              !excludedImportRowKeys.includes(String(index))
                            }
                            onChange={event =>
                              setExcludedImportRowKeys(keys =>
                                event.target.checked
                                  ? keys.filter(key => key !== String(index))
                                  : [...keys, String(index)]
                              )
                            }
                          />
                        </td>
                        <td className="p-2">{row.sourceSheet}</td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.entryDate.toISOString().slice(0, 10)}
                            onChange={event =>
                              setImportEdits(edits => ({
                                ...edits,
                                [index]: {
                                  ...edits[String(index)],
                                  entryDate: new Date(
                                    `${event.target.value}T12:00:00Z`
                                  ),
                                },
                              }))
                            }
                            className="h-8 rounded border border-input bg-background px-1"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            value={row.description}
                            onChange={event =>
                              setImportEdits(edits => ({
                                ...edits,
                                [index]: {
                                  ...edits[String(index)],
                                  description: event.target.value,
                                },
                              }))
                            }
                            className="h-8 w-40 rounded border border-input bg-background px-2"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={row.amountMinor}
                            onChange={event =>
                              setImportEdits(edits => ({
                                ...edits,
                                [index]: {
                                  ...edits[String(index)],
                                  amountMinor: Math.round(
                                    Number(event.target.value)
                                  ),
                                },
                              }))
                            }
                            className="h-8 w-28 rounded border border-input bg-background px-2"
                          />
                        </td>
                        <td className="p-2">{row.currencyCode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importRows.length > 8 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    تظهر أول 20 صفاً قابلاً للتعديل؛ سيتم استيراد الصفوف الـ{" "}
                    {importRows.length} بعد التأكيد.
                  </p>
                )}
              </div>
            </div>
          )}
        </article>
      )}
      <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h3 className="text-xl font-black">
              {isEnglish ? "Daily register" : "سجل الإدخالات اليومية"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isEnglish
                ? "Drafts are visible to reviewers; posted entries also appear in the official journal."
                : "تظهر المسودات للمراجعة، وتظهر الإدخالات المرحلة أيضاً ضمن دفتر القيود الرسمي."}
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            {filteredEntries.length} {isEnglish ? "entries" : "إدخال"}
          </span>
        </div>
        <div className="border-b border-border bg-muted/20 p-4">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
            <input
              type="date"
              value={dailyFilter.start}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  start: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <input
              type="date"
              value={dailyFilter.end}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  end: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <input
              value={dailyFilter.search}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  search: event.target.value,
                }))
              }
              placeholder="بحث بالبيان أو رقم الوصل"
              className="h-9 rounded-lg border border-blue-300 bg-background px-2 text-xs md:col-span-2"
            />
            <select
              value={dailyFilter.type}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  type: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="all">كل الأنواع</option>
              <option value="expense">مصروف</option>
              <option value="receipt">قبض</option>
              <option value="payment">صرف</option>
              <option value="transfer">تحويل</option>
              <option value="adjustment">تسوية</option>
            </select>
            <input
              value={dailyFilter.account}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  account: event.target.value,
                }))
              }
              placeholder="الحساب"
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <select
              value={dailyFilter.status}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  status: event.target.value,
                }))
              }
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            >
              <option value="all">كل الحالات</option>
              <option value="draft">مسودة</option>
              <option value="posted">مرحّل</option>
              <option value="cancelled">ملغى</option>
            </select>
            <input
              inputMode="decimal"
              value={dailyFilter.min}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  min: event.target.value,
                }))
              }
              placeholder="المبلغ من"
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
            <input
              inputMode="decimal"
              value={dailyFilter.max}
              onChange={event =>
                setDailyFilter(current => ({
                  ...current,
                  max: event.target.value,
                }))
              }
              placeholder="المبلغ إلى"
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs"
            />
          </div>
          {dailyFilter.search.trim() && (
            <div className="mt-3 overflow-auto">
              <p className="mb-2 text-xs font-black text-blue-800">
                تجميع النتائج المتشابهة ضمن المدة المحددة
              </p>
              <table className="w-full min-w-[620px] text-right text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-2">البيان</th>
                    <th className="p-2">عدد العمليات</th>
                    <th className="p-2">إجمالي USD</th>
                    <th className="p-2">إجمالي IQD</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDailyEntries.map(group => (
                    <tr
                      key={group.description}
                      className="border-b border-border/60"
                    >
                      <td className="p-2 font-bold">{group.description}</td>
                      <td className="p-2">{group.count}</td>
                      <td className="p-2">
                        {money(group.totalUsdMinor, "USD")}
                      </td>
                      <td className="p-2">
                        {money(group.totalIqdMinor, "IQD")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[1450px] text-right text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">
                  {isEnglish ? "Date / no." : "التاريخ / الرقم"}
                </th>
                <th className="p-3">رقم الوصل</th>
                <th className="p-3">{isEnglish ? "Description" : "البيان"}</th>
                <th className="p-3">العميل</th>
                <th className="p-3">المورد</th>
                <th className="p-3">المستخدم</th>
                <th className="p-3">{isEnglish ? "Debit" : "مدين"}</th>
                <th className="p-3">{isEnglish ? "Credit" : "دائن"}</th>
                <th className="p-3">{isEnglish ? "Amount" : "القيمة"}</th>
                <th className="p-3">
                  {isEnglish ? "Cost centre" : "مركز التكلفة"}
                </th>
                <th className="p-3">{isEnglish ? "Attachment" : "المرفق"}</th>
                <th className="p-3">{isEnglish ? "Status" : "الحالة"}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map(entry => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-mono text-xs">{entry.entryNumber}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(entry.createdAt, isEnglish ? "en" : "ar")}
                    </div>
                  </td>
                  <td className="p-3">{entry.voucherNumber ?? "—"}</td>
                  <td className="p-3 font-bold">
                    {entry.description}
                    <div className="mt-1 text-xs font-normal text-muted-foreground">
                      {entry.entryType}
                    </div>
                  </td>
                  <td className="p-3">{entry.customerPartnerName || "—"}</td>
                  <td className="p-3">{entry.supplierPartnerName || "—"}</td>
                  <td className="p-3">{entry.createdByName || "—"}</td>
                  <td className="p-3">
                    {entry.debitAccountCode} — {entry.debitAccountName}
                  </td>
                  <td className="p-3">
                    {entry.creditAccountCode} — {entry.creditAccountName}
                  </td>
                  <td className="p-3 font-black">
                    {money(Number(entry.amountMinor), entry.currencyCode)}
                    {entry.currencyCode !== "USD" && (
                      <div className="text-[11px] font-normal text-muted-foreground">
                        سعر {entry.marketExchangeRate}
                      </div>
                    )}
                  </td>
                  <td className="p-3">{entry.costCenterName ?? "—"}</td>
                  <td className="p-3">
                    {entry.attachmentUrl ? (
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={entry.attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          معاينة
                        </a>
                        <a
                          href={entry.attachmentUrl}
                          download
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-lg border border-border px-2 py-1 text-xs font-bold hover:bg-muted"
                        >
                          تنزيل
                        </a>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-lg px-2 py-1 text-xs font-bold ${entry.status === "posted" ? "bg-emerald-100 text-emerald-800" : entry.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}
                    >
                      {entry.status === "posted"
                        ? isEnglish
                          ? "Posted"
                          : "مرحّل"
                        : entry.status === "draft"
                          ? isEnglish
                            ? "Draft"
                            : "مسودة"
                          : isEnglish
                            ? "Cancelled"
                            : "ملغى"}
                    </span>
                  </td>
                  <td className="p-3">
                    {entry.status === "draft" && canPost && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => post.mutate({ dailyEntryId: entry.id })}
                        disabled={post.isPending}
                      >
                        {isEnglish ? "Post" : "ترحيل"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredEntries.length && (
                <tr>
                  <td
                    colSpan={13}
                    className="p-8 text-center text-muted-foreground"
                  >
                    {isEnglish
                      ? "No daily entries yet."
                      : "لا توجد إدخالات يومية بعد."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

export function AccountingWorkspace({
  language,
  initialTab,
}: {
  language: Language;
  initialTab?: Tab;
}) {
  const t = language === "en" ? en : ar;
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "accountingTab"
    );
    if (initialTab) return initialTab;
    return requested === "documents" ||
      requested === "dailyEntries" ||
      requested === "cashMovements" ||
      requested === "accounts" ||
      requested === "journals" ||
      requested === "approvals" ||
      requested === "payroll" ||
      requested === "reports" ||
      requested === "fixedAssets" ||
      requested === "administration"
      ? requested
      : "overview";
  });
  const [isNewOpen, setIsNewOpen] = useState(
    () => new URLSearchParams(window.location.search).get("newDocument") === "1"
  );
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(
    null
  );
  const [purchaseReturnSourceId, setPurchaseReturnSourceId] = useState("");
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [form, setForm] = useState(() => {
    const requestedType = new URLSearchParams(window.location.search).get(
      "documentType"
    );
    const type = types.some(([value]) => value === requestedType)
      ? (requestedType as DocumentType)
      : "saleInvoice";
    return {
      type,
      partnerId: "",
      branchId: "",
      sourceWarehouseId: "",
      paymentAccountId: "",
      destinationWarehouseId: "",
      costCenterId: "",
      priceListId: "",
      currency: "USD",
      marketExchangeRate: "1",
      dueAt: "",
      chequeNumber: "",
      note: "",
    };
  });
  const [draftLines, setDraftLines] = useState<DraftDocumentLine[]>([
    newLine(),
  ]);
  const [settlements, setSettlements] = useState<
    Array<{ targetDocumentId: string; amountMinor: string }>
  >([]);

  const access = trpc.accounting.access.useQuery();
  const roles = access.data?.roles ?? [];
  const permissions = access.data?.permissions ?? [];
  const canAccess = access.data?.canAccess ?? false;
  const canManage = access.data?.canManage ?? false;
  const uiAccess = useMemo(
    () => getAccountingUiAccess(roles, canManage, permissions),
    [canManage, permissions, roles]
  );
  const {
    canCreateDocument,
    canSubmitDocument,
    canApproveDocument,
    canViewFinance,
    canManagePayroll,
    canApproveCash,
    allowedDocumentTypes,
  } = uiAccess;
  const enabledQueries = useMemo(
    () => getEnabledAccountingQueries(canAccess, uiAccess),
    [canAccess, uiAccess]
  );
  const overview = trpc.accounting.overview.useQuery(undefined, {
    enabled: enabledQueries.overview,
  });
  const accounts = trpc.accounting.accounts.useQuery(undefined, {
    enabled: enabledQueries.accounts,
  });
  const documents = trpc.accounting.documents.useQuery(undefined, {
    enabled: enabledQueries.documents,
  });
  const documentDraft = trpc.accounting.documentDraft.useQuery(
    { documentId: editingDocumentId ?? 1 },
    { enabled: editingDocumentId !== null }
  );
  const approvals = trpc.accounting.approvals.useQuery(undefined, {
    enabled: enabledQueries.approvals,
  });
  const journals = trpc.accounting.journals.useQuery(undefined, {
    enabled: enabledQueries.journals,
  });
  const employees = trpc.accounting.employees.useQuery(undefined, {
    enabled: enabledQueries.employees,
  });
  const payrollDetails = trpc.accounting.payrollDetails.useQuery(undefined, {
    enabled: canManagePayroll,
  });
  const costCenters = trpc.accounting.costCenters.useQuery(undefined, {
    enabled: canCreateDocument,
  });
  const priceLists = trpc.accounting.priceLists.useQuery(undefined, {
    enabled: canCreateDocument,
  });
  const priceListItems = trpc.accounting.priceListItems.useQuery(
    { priceListId: Number(form.priceListId || 0) },
    {
      enabled:
        canCreateDocument &&
        form.type === "saleInvoice" &&
        Boolean(form.priceListId),
    }
  );
  const paymentAccounts = trpc.accounting.paymentAccounts.useQuery(undefined, {
    enabled: enabledQueries.paymentAccounts,
  });
  const settlementType =
    form.type === "receipt" || form.type === "payment" ? form.type : "receipt";
  const isDocumentModalOpen = isNewOpen || editingDocumentId !== null;
  const settlementTargets = trpc.accounting.settlementTargets.useQuery(
    { type: settlementType },
    {
      enabled:
        isDocumentModalOpen &&
        canCreateDocument &&
        (form.type === "receipt" || form.type === "payment"),
    }
  );
  const returnableSalesLines = trpc.accounting.returnableSalesLines.useQuery(
    undefined,
    { enabled: canViewFinance }
  );
  const returnablePurchaseLines =
    trpc.accounting.returnablePurchaseLines.useQuery(undefined, {
      enabled: canCreateDocument && form.type === "purchaseReturn",
    });
  const warehouses = trpc.accounting.warehouses.useQuery(undefined, {
    enabled: enabledQueries.warehouses,
  });
  const inventoryOverview = trpc.inventory.overview.useQuery(undefined, {
    enabled: enabledQueries.inventory,
  });
  const partners = trpc.commerce.partners.list.useQuery(undefined, {
    enabled: enabledQueries.partners,
  });

  const invalidate = async () => {
    await Promise.all([
      utils.accounting.overview.invalidate(),
      utils.accounting.documents.invalidate(),
      utils.accounting.approvals.invalidate(),
      utils.accounting.journals.invalidate(),
      utils.accounting.accounts.invalidate(),
    ]);
  };
  const resetDraft = () => {
    setEditingDocumentId(null);
    setPurchaseReturnSourceId("");
    setForm({
      type: "saleInvoice",
      partnerId: "",
      branchId: "",
      sourceWarehouseId: "",
      paymentAccountId: "",
      destinationWarehouseId: "",
      costCenterId: "",
      priceListId: "",
      currency: "USD",
      marketExchangeRate: "1",
      dueAt: "",
      chequeNumber: "",
      note: "",
    });
    setDraftLines([newLine()]);
    setSettlements([]);
  };
  const createDocument = trpc.accounting.createDocument.useMutation({
    onSuccess: async () => {
      toast.success(t.created);
      setIsNewOpen(false);
      resetDraft();
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updateDocumentDraft = trpc.accounting.updateDocumentDraft.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث المسودة مع سجل تدقيق");
      setIsNewOpen(false);
      resetDraft();
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const submitDocument = trpc.accounting.submitDocument.useMutation({
    onSuccess: async () => {
      toast.success(t.submitted);
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const cancelDocument = trpc.accounting.cancelDocument.useMutation({
    onSuccess: async () => {
      toast.success("تم إلغاء المسودة مع الاحتفاظ بسجل التدقيق");
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const approveDocument = trpc.accounting.approveDocument.useMutation({
    onSuccess: async () => {
      toast.success(t.approved);
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const createPayroll = trpc.accounting.createPayroll.useMutation({
    onSuccess: async () => {
      toast.success(t.payrollCreated);
      await utils.accounting.payrollDetails.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const updatePayroll = trpc.accounting.updatePayrollLine.useMutation({
    onSuccess: async () => {
      toast.success("تم تحديث السلفة والاستقطاع");
      await utils.accounting.payrollDetails.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const submitPayroll = trpc.accounting.submitPayroll.useMutation({
    onSuccess: async () => {
      toast.success("تم إرسال مسير الرواتب للموافقة");
      await utils.accounting.payrollDetails.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const approvePayroll = trpc.accounting.approvePayroll.useMutation({
    onSuccess: async () => {
      toast.success("تم اعتماد وترحيل مسير الرواتب");
      await utils.accounting.payrollDetails.invalidate();
      await utils.accounting.journals.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const money = (value: number, currency = "USD") =>
    new Intl.NumberFormat(language === "en" ? "en-US" : "ar-IQ", {
      style: "currency",
      currency,
      currencyDisplay: currency === "USD" ? "code" : "symbol",
      maximumFractionDigits: currency === "IQD" ? 0 : 2,
    }).format(value);
  const payrollRun = payrollDetails.data?.runs[0];
  const payrollLines = payrollRun
    ? (payrollDetails.data?.lines.filter(
        line => line.payrollRunId === payrollRun.id
      ) ?? [])
    : [];
  const payrollExportSections: ReportSection[] = payrollRun
    ? [
        {
          title: `مسير الرواتب: ${payrollRun.name}`,
          columns: ["البيان", "القيمة"],
          rows: [
            [
              "الفترة",
              `${new Date(payrollRun.periodStart).toLocaleDateString("ar-IQ")} — ${new Date(payrollRun.periodEnd).toLocaleDateString("ar-IQ")}`,
            ],
            ["الحالة", payrollRun.status],
            ["عدد الموظفين", payrollLines.length],
          ],
        },
        {
          title: "تفاصيل الموظفين",
          columns: [
            "الموظف",
            "أيام الحضور",
            "الإضافي",
            "قيمة الإضافي",
            "البدلات",
            "الإجمالي",
            "التأمينات",
            "الضريبة",
            "السلفة",
            "الاستقطاع",
            "الصافي",
          ],
          rows: payrollLines.map(line => [
            line.employeeName,
            line.workingDays ?? 0,
            line.overtimeMinutes ?? 0,
            money(Number(line.overtimeMinor ?? 0)),
            money(Number(line.allowancesMinor ?? 0)),
            money(Number(line.grossMinor ?? 0)),
            money(Number(line.insuranceMinor ?? 0)),
            money(Number(line.taxMinor ?? 0)),
            money(Number(line.advanceMinor ?? 0)),
            money(Number(line.deductionMinor ?? 0)),
            money(Number(line.netMinor ?? 0)),
          ]),
        },
      ]
    : [];
  const draftTotal = draftLines.reduce(
    (total, line) =>
      total +
      Math.max(0, Number(line.quantity) || 0) *
        Math.max(0, Number(line.price) || 0) -
      Math.max(0, Number(line.discount) || 0),
    0
  );
  const updateDraftLine = (
    id: string,
    field: keyof Omit<DraftDocumentLine, "id">,
    value: string
  ) =>
    setDraftLines(lines =>
      lines.map(line => (line.id === id ? { ...line, [field]: value } : line))
    );
  const removeDraftLine = (id: string) =>
    setDraftLines(lines =>
      lines.length === 1 ? lines : lines.filter(line => line.id !== id)
    );
  const availableVariants = useMemo(
    () =>
      (inventoryOverview.data?.items ?? []).flatMap(item =>
        item.variants.map(variant => ({ ...variant, itemName: item.name }))
      ),
    [inventoryOverview.data?.items]
  );
  const visibleDocuments = useMemo(
    () => documents.data ?? [],
    [documents.data]
  );
  const metricCards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
    color: string;
  }> = [
    {
      label: t.assets,
      value: overview.data?.metrics.accounts ?? 0,
      icon: BookOpenCheck,
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: t.documents,
      value: overview.data?.metrics.documents ?? 0,
      icon: ReceiptText,
      color: "bg-violet-50 text-violet-700",
    },
    {
      label: t.pending,
      value: overview.data?.metrics.pending ?? 0,
      icon: ClipboardCheck,
      color: "bg-amber-50 text-amber-800",
    },
    {
      label: t.entries,
      value: overview.data?.metrics.postedJournals ?? 0,
      icon: Landmark,
      color: "bg-emerald-50 text-emerald-700",
    },
    {
      label: t.employees,
      value: overview.data?.metrics.employees ?? 0,
      icon: UsersRound,
      color: "bg-rose-50 text-rose-700",
    },
  ];
  const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
    { id: "overview", label: t.overview, icon: Landmark },
    { id: "documents", label: t.documents, icon: ReceiptText },
    { id: "dailyEntries", label: t.dailyEntries, icon: FilePlus2 },
    { id: "accounts", label: t.accounts, icon: BookOpenCheck },
    { id: "journals", label: t.journals, icon: FileText },
    { id: "approvals", label: t.approvals, icon: ClipboardCheck },
    { id: "payroll", label: t.payroll, icon: UsersRound },
    { id: "reports", label: t.reports, icon: TrendingUp },
    { id: "fixedAssets", label: t.fixedAssets, icon: Building2 },
    { id: "administration", label: t.administration, icon: Settings2 },
  ];
  const allowedTabKey = uiAccess.allowedTabs.join("|");
  const visibleTabs = useMemo(
    () => tabs.filter(item => uiAccess.allowedTabs.includes(item.id)),
    [allowedTabKey]
  );
  useEffect(() => {
    if (!access.isLoading && !visibleTabs.some(item => item.id === tab)) {
      if (
        permissionNotice !==
        "لا تملك صلاحية الوصول إلى هذا القسم، لذلك تم تحويلك إلى لوحة المحاسبة."
      )
        setPermissionNotice(
          "لا تملك صلاحية الوصول إلى هذا القسم، لذلك تم تحويلك إلى لوحة المحاسبة."
        );
      if (tab !== "overview") setTab("overview");
    }
  }, [access.isLoading, permissionNotice, tab, visibleTabs]);
  useEffect(() => {
    if (!access.isLoading && !canCreateDocument && isNewOpen)
      setIsNewOpen(false);
  }, [access.isLoading, canCreateDocument, isNewOpen]);
  useEffect(() => {
    if (!access.isLoading && !allowedDocumentTypes.includes(form.type))
      setForm(current => ({
        ...current,
        type: allowedDocumentTypes[0] ?? "stockTransfer",
      }));
  }, [access.isLoading, allowedDocumentTypes, form.type]);
  useEffect(() => {
    const draft = documentDraft.data;
    if (!draft || editingDocumentId === null) return;
    setForm({
      type: draft.document.type,
      partnerId: draft.document.partnerId
        ? String(draft.document.partnerId)
        : "",
      branchId: String(draft.document.branchId),
      sourceWarehouseId: draft.document.warehouseId
        ? String(draft.document.warehouseId)
        : "",
      paymentAccountId: draft.document.paymentAccountId
        ? String(draft.document.paymentAccountId)
        : "",
      destinationWarehouseId: draft.document.destinationWarehouseId
        ? String(draft.document.destinationWarehouseId)
        : "",
      costCenterId: draft.document.costCenterId
        ? String(draft.document.costCenterId)
        : "",
      priceListId: draft.document.priceListId
        ? String(draft.document.priceListId)
        : "",
      currency: draft.document.currencyCode,
      marketExchangeRate: draft.document.marketExchangeRate
        ? String(draft.document.marketExchangeRate)
        : draft.document.currencyCode === "USD"
          ? "1"
          : String(100_000_000 / draft.document.exchangeRatePpm),
      dueAt: draft.document.dueAt
        ? new Date(draft.document.dueAt).toISOString().slice(0, 10)
        : "",
      chequeNumber: draft.document.chequeNumber ?? "",
      note: draft.document.note ?? "",
    });
    setDraftLines(
      draft.lines.map(line => ({
        id: createDraftLineId(),
        variantId: line.variantId ? String(line.variantId) : "",
        sourceDocumentLineId: line.sourceDocumentLineId
          ? String(line.sourceDocumentLineId)
          : "",
        description: line.description,
        quantity: String(line.quantity),
        price: String(line.unitPriceMinor),
        discount: String(line.discountMinor),
      }))
    );
    setSettlements(
      draft.settlements.map(settlement => ({
        targetDocumentId: String(settlement.targetDocumentId),
        amountMinor: String(settlement.amountMinor),
      }))
    );
  }, [documentDraft.data, editingDocumentId]);
  useEffect(() => {
    if (
      form.type !== "saleInvoice" ||
      !form.priceListId ||
      !priceListItems.data?.items.length
    )
      return;
    const priceByVariant = new Map(
      priceListItems.data.items.map(item => [
        String(item.variantId),
        { base: item.unitPriceMinor, tiers: item.tiers },
      ])
    );
    setDraftLines(lines => {
      let changed = false;
      const next = lines.map(line => {
        const priceDefinition = line.variantId
          ? priceByVariant.get(line.variantId)
          : undefined;
        if (!priceDefinition) return line;
        const tier = [...(priceDefinition.tiers ?? [])]
          .sort((left, right) => right.minimumQuantity - left.minimumQuantity)
          .find(
            candidate => Number(line.quantity) >= candidate.minimumQuantity
          );
        const price = String(tier?.unitPriceMinor ?? priceDefinition.base);
        if (line.price === price) return line;
        changed = true;
        return { ...line, price };
      });
      return changed ? next : lines;
    });
  }, [draftLines, form.priceListId, form.type, priceListItems.data]);

  if (access.isLoading || (canAccess && overview.isLoading && !overview.data))
    return (
      <div className="grid min-h-72 place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
      </div>
    );
  if (!canAccess)
    return (
      <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
        <div>
          <h2 className="text-xl font-black">لا توجد صلاحية محاسبية</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            اطلب من المدير تعيين دور محاسبي مناسب لحسابك.
          </p>
        </div>
      </div>
    );
  if (overview.isError && !overview.data)
    return (
      <div className="grid min-h-72 place-items-center rounded-3xl border border-dashed border-red-200 bg-red-50 p-8 text-center">
        <div>
          <h2 className="text-xl font-black text-red-900">
            تعذر تحميل لوحة المحاسبة
          </h2>
          <p className="mt-2 text-sm text-red-800">{overview.error.message}</p>
        </div>
      </div>
    );

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
            {t.subtitle}
          </p>
          <h2 className="mt-1 text-3xl font-black">{t.title}</h2>
        </div>
        {canCreateDocument && (
          <Button
            onClick={() => {
              resetDraft();
              setIsNewOpen(true);
            }}
            className="rounded-xl bg-blue-700 hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            {t.newDocument}
          </Button>
        )}
      </header>
      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-1">
        {visibleTabs.map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${tab === item.id ? "bg-blue-700 text-white" : "text-muted-foreground hover:bg-muted"}`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </nav>
      {permissionNotice && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          <span>{permissionNotice}</span>
          <button
            onClick={() => setPermissionNotice(null)}
            className="rounded-lg px-2 py-1 hover:bg-amber-100"
          >
            ×
          </button>
        </div>
      )}

      {tab === "overview" && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {metricCards.map(card => (
              <MetricCard key={card.label} {...card} />
            ))}
          </section>
          <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-black">{t.documents}</h3>
            <DocumentList
              documents={overview.data?.recentDocuments ?? []}
              t={t}
              money={money}
              canSubmit={canSubmitDocument && canViewFinance}
              canApprove={canApproveDocument}
              canEditHistorical={uiAccess.canEditHistorical}
              onSubmit={id => submitDocument.mutate({ documentId: id })}
              onCancel={id => cancelDocument.mutate({ documentId: id })}
              onApprove={id => approveDocument.mutate({ documentId: id })}
            />
          </section>
        </>
      )}
      {tab === "documents" && (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <DocumentList
            documents={visibleDocuments}
            t={t}
            money={money}
            canSubmit={canSubmitDocument}
            canApprove={canApproveDocument}
            canEditHistorical={uiAccess.canEditHistorical}
            onSubmit={id => submitDocument.mutate({ documentId: id })}
            onCancel={id => cancelDocument.mutate({ documentId: id })}
            onApprove={id => approveDocument.mutate({ documentId: id })}
            onEdit={id => setEditingDocumentId(id)}
          />
        </section>
      )}
      {tab === "cashMovements" && <AccountingMovementsPanel language={language} />}
      {tab === "dailyEntries" && (
        <DailyEntryPanel
          language={language}
          canCreate={canCreateDocument}
          canPost={canApproveDocument}
          canCarryCashForward={uiAccess.canCarryCashForward}
          canApproveCash={canApproveCash}
        />
      )}
      {tab === "accounts" && (
        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="p-4">{t.accounts}</th>
                <th className="p-4">الرمز</th>
                <th className="p-4">النوع</th>
                <th className="p-4">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data?.map(account => (
                <tr key={account.id} className="border-t border-border">
                  <td className="p-4 font-bold">{account.name}</td>
                  <td className="p-4 font-mono">{account.code}</td>
                  <td className="p-4">{account.type}</td>
                  <td className="p-4">{account.isActive ? "فعال" : "موقوف"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!accounts.data?.length && <Empty text={t.noData} />}
        </section>
      )}
      {tab === "journals" && (
        <section className="space-y-3">
          {journals.data?.map(journal => (
            <article
              key={journal.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div>
                <p className="font-black">{journal.entryNumber}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {journal.sourceType} ·{" "}
                  {formatDateTime(journal.entryDate, language === "en" ? "en" : "ar")}
                </p>
                {journal.costCenters.length > 0 && (
                  <p className="mt-2 text-xs font-bold text-blue-700">
                    مركز التكلفة: {journal.costCenters.join("، ")}
                  </p>
                )}
              </div>
              <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
                {t.posted}
              </span>
            </article>
          ))}
          {!journals.data?.length && <Empty text={t.noData} />}
        </section>
      )}
      {tab === "approvals" && (
        <section className="space-y-3">
          {approvals.data?.map(approval => (
            <article
              key={approval.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <div>
                <p className="font-black">
                  {approval.entityType} #{approval.entityId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(approval.createdAt, language === "en" ? "en" : "ar")}
                </p>
                {approval.reason && (
                  <p className="mt-2 text-sm text-amber-800">
                    {approval.reason}
                  </p>
                )}
              </div>
              <span
                className={`rounded-lg px-2 py-1 text-xs font-bold ${statusClass[approval.status] ?? "bg-muted"}`}
              >
                {approval.status === "pending" ? t.pending : approval.status}
              </span>
            </article>
          ))}
          {!approvals.data?.length && <Empty text={t.noData} />}
        </section>
      )}
      {tab === "payroll" && (
        <section className="space-y-5">
          <EmployeeQuickAdd />
          <section className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
            <PayrollPeriodForm
              isPending={createPayroll.isPending}
              onCreate={input => createPayroll.mutate(input)}
            />
            <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-black">{t.employees}</h3>
              <div className="mt-4 space-y-2">
                {employees.data?.map(employee => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3"
                  >
                    <span className="font-bold">{employee.fullName}</span>
                    <span className="text-xs text-muted-foreground">
                      {employee.jobTitle ?? "—"}
                    </span>
                  </div>
                ))}
                {!employees.data?.length && <Empty text={t.noData} />}
              </div>
            </article>
          </section>
          <AttendanceReviewPanel
            employees={employees.data ?? []}
            canApprove={canManage}
          />
          <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
              <div>
                <h3 className="font-black">تفاصيل أحدث مسير</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  يظهر الحضور والإضافي للمراجعة؛ السلف والاستقطاعات بوحدات السنت
                  الأمريكي.
                </p>
              </div>
              {payrollRun && (
                <div className="flex flex-wrap gap-2">
                  {payrollRun.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submitPayroll.isPending}
                      onClick={() =>
                        submitPayroll.mutate({ payrollRunId: payrollRun.id })
                      }
                    >
                      إرسال للموافقة
                    </Button>
                  )}
                  {canApproveDocument &&
                    payrollRun.status === "pendingApproval" && (
                      <Button
                        size="sm"
                        disabled={approvePayroll.isPending}
                        onClick={() =>
                          approvePayroll.mutate({ payrollRunId: payrollRun.id })
                        }
                      >
                        اعتماد وترحيل
                      </Button>
                    )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      exportReportToExcel(
                        "مسير-رواتب",
                        "تقرير مسير الرواتب",
                        payrollExportSections
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
                          "تقرير مسير الرواتب",
                          payrollExportSections
                        )
                      )
                        toast.error("اسمح بفتح نافذة التقرير لإكمال تصدير PDF");
                    }}
                  >
                    تصدير PDF
                  </Button>
                </div>
              )}
            </div>
            {payrollRun ? (
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full min-w-[920px] text-right text-sm">
                  <thead className="sticky top-0 bg-muted/70 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">الموظف</th>
                      <th className="p-3">أيام الحضور</th>
                      <th className="p-3">الإضافي</th>
                      <th className="p-3">قيمة الإضافي</th>
                      <th className="p-3">الإجمالي</th>
                      <th className="p-3">السلفة</th>
                      <th className="p-3">الاستقطاع</th>
                      <th className="p-3">الصافي</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payrollLines.map(line => (
                      <PayrollLineEditor
                        key={line.employeeId}
                        line={line}
                        saving={updatePayroll.isPending}
                        onSave={(advanceMinor, deductionMinor) =>
                          updatePayroll.mutate({
                            payrollRunId: line.payrollRunId,
                            employeeId: line.employeeId,
                            advanceMinor,
                            deductionMinor,
                          })
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="لا يوجد مسير رواتب بعد." />
            )}
          </article>
        </section>
      )}
      {tab === "reports" && <FinancialReportsPanel />}
      {tab === "fixedAssets" && canManage && (
        <FixedAssetsPanel
          accounts={accounts.data ?? []}
          branches={overview.data?.branches ?? []}
        />
      )}
      {tab === "administration" && <AccountingAdministrationPanel />}

      {isDocumentModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4">
          {editingDocumentId !== null && documentDraft.isLoading ? (
            <div className="grid min-h-48 w-full max-w-lg place-items-center rounded-3xl bg-card p-6 shadow-2xl">
              <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
            </div>
          ) : (
            <form
              onSubmit={event => {
                event.preventDefault();
                const payload = {
                  partnerId: form.partnerId
                    ? Number(form.partnerId)
                    : undefined,
                  branchId: form.branchId ? Number(form.branchId) : undefined,
                  warehouseId: form.sourceWarehouseId
                    ? Number(form.sourceWarehouseId)
                    : undefined,
                  paymentAccountId: form.paymentAccountId
                    ? Number(form.paymentAccountId)
                    : undefined,
                  destinationWarehouseId: form.destinationWarehouseId
                    ? Number(form.destinationWarehouseId)
                    : undefined,
                  costCenterId: form.costCenterId
                    ? Number(form.costCenterId)
                    : undefined,
                  priceListId: form.priceListId
                    ? Number(form.priceListId)
                    : undefined,
                  settlements: settlements
                    .filter(
                      settlement =>
                        settlement.targetDocumentId &&
                        Number(settlement.amountMinor) > 0
                    )
                    .map(settlement => ({
                      targetDocumentId: Number(settlement.targetDocumentId),
                      amountMinor: Number(settlement.amountMinor),
                    })),
                  dueAt: form.dueAt
                    ? new Date(`${form.dueAt}T00:00:00.000Z`)
                    : undefined,
                  chequeNumber: form.chequeNumber || undefined,
                  currencyCode: form.currency,
                  marketExchangeRate:
                    form.currency === "USD"
                      ? 1
                      : Number(form.marketExchangeRate),
                  note: form.note || undefined,
                  lines: draftLines.map(line => ({
                    variantId: line.variantId
                      ? Number(line.variantId)
                      : undefined,
                    sourceDocumentLineId: line.sourceDocumentLineId
                      ? Number(line.sourceDocumentLineId)
                      : undefined,
                    description: line.description,
                    quantity: Number(line.quantity),
                    unitPriceMinor: Number(line.price),
                    discountMinor: Number(line.discount),
                  })),
                };
                if (editingDocumentId !== null)
                  updateDocumentDraft.mutate({
                    ...payload,
                    documentId: editingDocumentId,
                    historicalEdit: uiAccess.canEditHistorical,
                  });
                else createDocument.mutate({ ...payload, type: form.type });
              }}
              className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black">
                    {editingDocumentId !== null
                      ? "تعديل وترحيل المستند"
                      : t.newDocument}
                  </h3>
                  {editingDocumentId !== null && (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        لا يمكن تغيير نوع المستند أو فرعه بعد إنشائه، وتبقى المسودة قابلة للتعديل قبل الإرسال فقط.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        للمستند المرحّل، يسمح المدير أو صاحب الصلاحية بالتعديل؛ ويحفظ النظام عكساً محاسبياً وسجلاً تدقيقياً ثم ينشئ نسخة مرحّلة بديلة.
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsNewOpen(false);
                    resetDraft();
                  }}
                  className="rounded-lg px-3 py-1 text-muted-foreground hover:bg-muted"
                >
                  ×
                </button>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={t.documentType}>
                  <select
                    value={form.type}
                    disabled={editingDocumentId !== null}
                    onChange={event => {
                      setForm({
                        ...form,
                        type: event.target.value as DocumentType,
                      });
                      setPurchaseReturnSourceId("");
                      setSettlements([]);
                    }}
                  >
                    {types
                      .filter(([value]) => allowedDocumentTypes.includes(value))
                      .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t.currency}>
                  <select
                    value={form.currency}
                    onChange={event => {
                      const currency = event.target.value;
                      setForm({
                        ...form,
                        currency,
                        priceListId: "",
                        marketExchangeRate: currency === "USD" ? "1" : "",
                      });
                    }}
                  >
                    <option value="USD">USD</option>
                    <option value="IQD">IQD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </Field>
                <Field label="قائمة الأسعار">
                  <select
                    value={form.priceListId}
                    onChange={event =>
                      setForm({ ...form, priceListId: event.target.value })
                    }
                  >
                    <option value="">القائمة الافتراضية النشطة</option>
                    {priceLists.data
                      ?.filter(
                        priceList => priceList.currencyCode === form.currency
                      )
                      .map(priceList => (
                        <option key={priceList.id} value={priceList.id}>
                          {priceList.code} — {priceList.name} (حد الخصم{" "}
                          {priceList.maxDiscountBps / 100}%)
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="الفرع">
                  <select
                    value={form.branchId}
                    disabled={editingDocumentId !== null}
                    onChange={event =>
                      setForm({ ...form, branchId: event.target.value })
                    }
                  >
                    <option value="">الفرع الافتراضي</option>
                    {overview.data?.branches.map(branch => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="مركز التكلفة">
                  <select
                    value={form.costCenterId}
                    onChange={event =>
                      setForm({ ...form, costCenterId: event.target.value })
                    }
                  >
                    <option value="">اختياري — من دون إسناد</option>
                    {costCenters.data?.map(center => (
                      <option key={center.id} value={center.id}>
                        {center.code} — {center.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={
                    form.currency === "USD"
                      ? "سعر الصرف"
                      : `سعر السوق: 1 USD = كم ${form.currency}؟`
                  }
                >
                  <input
                    required={form.currency !== "USD"}
                    min="0.00000001"
                    step="any"
                    type="number"
                    readOnly={form.currency === "USD"}
                    className={
                      form.currency === "USD"
                        ? "cursor-not-allowed bg-muted/60"
                        : undefined
                    }
                    placeholder={
                      form.currency === "USD"
                        ? "1"
                        : form.currency === "IQD"
                          ? "1570"
                          : "أدخل سعر السوق"
                    }
                    value={form.marketExchangeRate}
                    onChange={event =>
                      setForm({
                        ...form,
                        marketExchangeRate: event.target.value,
                      })
                    }
                  />
                  <span className="text-xs font-normal leading-5 text-muted-foreground">
                    {form.currency === "USD"
                      ? "USD هي العملة الأساسية؛ يثبت النظام قيمتها على 1."
                      : "أدخل السعر الحقيقي اليومي، مثل 1570. يحوّله النظام داخلياً للحسابات ويحفظه مع الفاتورة."}
                  </span>
                </Field>
                <Field label={t.partner} className="sm:col-span-2">
                  <select
                    value={form.partnerId}
                    onChange={event =>
                      setForm({ ...form, partnerId: event.target.value })
                    }
                  >
                    <option value="">—</option>
                    {partners.data?.map(partner => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {(form.type === "saleInvoice" ||
                  form.type === "purchaseInvoice") && (
                  <Field label="تاريخ الاستحقاق" className="sm:col-span-2">
                    <input
                      type="date"
                      value={form.dueAt}
                      onChange={event =>
                        setForm({ ...form, dueAt: event.target.value })
                      }
                    />
                  </Field>
                )}
                {(form.type === "receipt" || form.type === "payment") && (
                  <>
                    <Field label="حساب الدفع" className="sm:col-span-2">
                      <select
                        required
                        value={form.paymentAccountId}
                        onChange={event => {
                          const paymentAccountId = event.target.value;
                          const account = paymentAccounts.data?.find(
                            item => String(item.id) === paymentAccountId
                          );
                          setForm({
                            ...form,
                            paymentAccountId,
                            chequeNumber:
                              account?.type === "cheque"
                                ? form.chequeNumber
                                : "",
                          });
                        }}
                      >
                        <option value="">اختر الصندوق أو البنك أو الشيك</option>
                        {paymentAccounts.data
                          ?.filter(
                            account => account.currencyCode === form.currency
                          )
                          .map(account => (
                            <option key={account.id} value={account.id}>
                              {account.name} — {account.type}
                            </option>
                          ))}
                      </select>
                    </Field>
                    {paymentAccounts.data?.find(
                      account => String(account.id) === form.paymentAccountId
                    )?.type === "cheque" && (
                      <Field label="رقم الشيك" className="sm:col-span-2">
                        <input
                          required
                          maxLength={80}
                          value={form.chequeNumber}
                          onChange={event =>
                            setForm({
                              ...form,
                              chequeNumber: event.target.value,
                            })
                          }
                          placeholder="رقم الشيك كما هو مطبوع"
                        />
                      </Field>
                    )}
                  </>
                )}
                {form.type === "stockTransfer" && (
                  <>
                    <Field label="مخزن المصدر">
                      <select
                        required
                        value={form.sourceWarehouseId}
                        onChange={event =>
                          setForm({
                            ...form,
                            sourceWarehouseId: event.target.value,
                            destinationWarehouseId:
                              form.destinationWarehouseId === event.target.value
                                ? ""
                                : form.destinationWarehouseId,
                          })
                        }
                      >
                        <option value="">اختر مخزن المصدر</option>
                        {warehouses.data?.map(warehouse => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.branchName} — {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="المخزن الوجهة">
                      <select
                        required
                        value={form.destinationWarehouseId}
                        onChange={event =>
                          setForm({
                            ...form,
                            destinationWarehouseId: event.target.value,
                          })
                        }
                      >
                        <option value="">اختر مخزن الوجهة</option>
                        {warehouses.data
                          ?.filter(
                            warehouse =>
                              String(warehouse.id) !== form.sourceWarehouseId
                          )
                          .map(warehouse => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.branchName} — {warehouse.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </>
                )}
                {form.type === "purchaseReturn" && (
                  <Field
                    label="سطر فاتورة الشراء الأصلي"
                    className="sm:col-span-2"
                  >
                    <select
                      required
                      value={purchaseReturnSourceId}
                      onChange={event => {
                        const source = returnablePurchaseLines.data?.find(
                          line => String(line.id) === event.target.value
                        );
                        setPurchaseReturnSourceId(event.target.value);
                        if (!source) return;
                        setForm(current => ({
                          ...current,
                          partnerId: source.partnerId
                            ? String(source.partnerId)
                            : "",
                          sourceWarehouseId: source.warehouseId
                            ? String(source.warehouseId)
                            : "",
                          currency: source.currencyCode,
                          marketExchangeRate: source.marketExchangeRate
                            ? String(source.marketExchangeRate)
                            : source.currencyCode === "USD"
                              ? "1"
                              : String(100_000_000 / source.exchangeRatePpm),
                          priceListId: "",
                        }));
                        setDraftLines([
                          {
                            id: createDraftLineId(),
                            sourceDocumentLineId: String(source.id),
                            variantId: source.variantId
                              ? String(source.variantId)
                              : "",
                            description: source.description,
                            quantity: "1",
                            price: String(source.unitPriceMinor),
                            discount: String(
                              Math.round(source.discountMinor / source.quantity)
                            ),
                          },
                        ]);
                      }}
                    >
                      <option value="">اختر سطر الشراء المرحّل</option>
                      {returnablePurchaseLines.data?.map(source => (
                        <option key={source.id} value={source.id}>
                          {source.documentNumber} — {source.description} (متاح{" "}
                          {source.availableQuantity})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              {(form.type === "receipt" || form.type === "payment") && (
                <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/50 dark:bg-blue-950/15">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="font-black">تخصيص التسوية على الفواتير</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        اختياري؛ يحدّث الرصيد المتبقي للفاتورة ولا يسمح بتجاوزه.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSettlements(current => [
                          ...current,
                          { targetDocumentId: "", amountMinor: "" },
                        ])
                      }
                    >
                      إضافة فاتورة للتسوية
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {settlements.map((settlement, index) => {
                      const targets =
                        settlementTargets.data?.filter(
                          target =>
                            (!form.partnerId ||
                              String(target.partnerId) === form.partnerId) &&
                            target.currencyCode === form.currency &&
                            !settlements.some(
                              (other, otherIndex) =>
                                otherIndex !== index &&
                                other.targetDocumentId === String(target.id)
                            )
                        ) ?? [];
                      const selected = targets.find(
                        target =>
                          String(target.id) === settlement.targetDocumentId
                      );
                      return (
                        <div
                          key={index}
                          className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[1fr_150px_auto]"
                        >
                          <Field label="الفاتورة المرحلة">
                            <select
                              value={settlement.targetDocumentId}
                              onChange={event => {
                                const target = targets.find(
                                  item => String(item.id) === event.target.value
                                );
                                setSettlements(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          targetDocumentId: event.target.value,
                                          amountMinor: target
                                            ? String(target.outstandingMinor)
                                            : "",
                                        }
                                      : item
                                  )
                                );
                              }}
                            >
                              <option value="">اختر الفاتورة المفتوحة</option>
                              {targets.map(target => (
                                <option key={target.id} value={target.id}>
                                  {target.documentNumber} — {target.partnerName}{" "}
                                  (
                                  {money(
                                    target.outstandingMinor,
                                    target.currencyCode
                                  )}
                                  )
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="مبلغ التخصيص">
                            <input
                              required={Boolean(settlement.targetDocumentId)}
                              min="1"
                              max={selected?.outstandingMinor}
                              type="number"
                              value={settlement.amountMinor}
                              onChange={event =>
                                setSettlements(current =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          amountMinor: event.target.value,
                                        }
                                      : item
                                  )
                                )
                              }
                            />
                          </Field>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSettlements(current =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index
                                  )
                                )
                              }
                            >
                              حذف
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {settlements.length > 0 &&
                      !settlementTargets.data?.length && (
                        <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                          لا توجد فواتير مفتوحة تطابق الطرف والعملة المختارين.
                        </p>
                      )}
                  </div>
                </section>
              )}
              <section className="mt-6 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-black">بنود المستند</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      أدخل تفاصيل كل بند والخصم الخاص به.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={form.type === "purchaseReturn"}
                    onClick={() =>
                      setDraftLines(lines => [...lines, newLine()])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    إضافة بند
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {draftLines.map((line, index) => {
                    const lineTotal =
                      Math.max(0, Number(line.quantity) || 0) *
                        Math.max(0, Number(line.price) || 0) -
                      Math.max(0, Number(line.discount) || 0);
                    const purchaseSource =
                      form.type === "purchaseReturn"
                        ? returnablePurchaseLines.data?.find(
                            source =>
                              String(source.id) === line.sourceDocumentLineId
                          )
                        : undefined;
                    return (
                      <div
                        key={line.id}
                        className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[minmax(0,1fr)_90px_110px_100px_120px_auto]"
                      >
                        <div className="grid gap-3">
                          <Field label={`${t.description} ${index + 1}`}>
                            <input
                              required
                              value={line.description}
                              readOnly={form.type === "purchaseReturn"}
                              onChange={event =>
                                updateDraftLine(
                                  line.id,
                                  "description",
                                  event.target.value
                                )
                              }
                            />
                          </Field>
                          <Field label="الصنف المخزني">
                            <select
                              required={
                                form.type === "stockTransfer" ||
                                form.type === "salesReturn" ||
                                form.type === "purchaseReturn"
                              }
                              value={line.variantId}
                              disabled={form.type === "purchaseReturn"}
                              onChange={event =>
                                updateDraftLine(
                                  line.id,
                                  "variantId",
                                  event.target.value
                                )
                              }
                            >
                              <option value="">
                                {form.type === "stockTransfer"
                                  ? "اختر الصنف للتحويل"
                                  : "اختياري"}
                              </option>
                              {availableVariants.map(variant => (
                                <option key={variant.id} value={variant.id}>
                                  {variant.itemName} — {variant.color ?? ""}{" "}
                                  {variant.size ?? ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {form.type === "salesReturn" && (
                            <Field label="سطر فاتورة البيع الأصلي">
                              <select
                                required
                                value={line.sourceDocumentLineId}
                                onChange={event => {
                                  const sourceDocumentLineId =
                                    event.target.value;
                                  const source =
                                    returnableSalesLines.data?.find(
                                      sourceLine =>
                                        String(sourceLine.id) ===
                                        sourceDocumentLineId
                                    );
                                  setDraftLines(lines =>
                                    lines.map(current =>
                                      current.id === line.id
                                        ? {
                                            ...current,
                                            sourceDocumentLineId,
                                            variantId: source?.variantId
                                              ? String(source.variantId)
                                              : current.variantId,
                                            description:
                                              source?.description ??
                                              current.description,
                                          }
                                        : current
                                    )
                                  );
                                }}
                              >
                                <option value="">اختر سطر البيع المرحّل</option>
                                {returnableSalesLines.data?.map(sourceLine => (
                                  <option
                                    key={sourceLine.id}
                                    value={sourceLine.id}
                                  >
                                    {sourceLine.documentNumber} —{" "}
                                    {sourceLine.description} (
                                    {sourceLine.quantity})
                                  </option>
                                ))}
                              </select>
                            </Field>
                          )}
                        </div>
                        <Field label={t.quantity}>
                          <input
                            required
                            min="1"
                            max={purchaseSource?.availableQuantity}
                            type="number"
                            value={line.quantity}
                            onChange={event => {
                              const quantity = event.target.value;
                              setDraftLines(lines =>
                                lines.map(current =>
                                  current.id === line.id
                                    ? {
                                        ...current,
                                        quantity,
                                        discount: purchaseSource
                                          ? String(
                                              Math.round(
                                                (purchaseSource.discountMinor *
                                                  (Number(quantity) || 0)) /
                                                  purchaseSource.quantity
                                              )
                                            )
                                          : current.discount,
                                      }
                                    : current
                                )
                              );
                            }}
                          />
                        </Field>
                        <Field label={t.unitPrice}>
                          <input
                            required
                            min="0"
                            type="number"
                            readOnly={form.type === "purchaseReturn"}
                            value={line.price}
                            onChange={event =>
                              updateDraftLine(
                                line.id,
                                "price",
                                event.target.value
                              )
                            }
                          />
                        </Field>
                        <Field label="الخصم">
                          <input
                            required
                            min="0"
                            type="number"
                            readOnly={form.type === "purchaseReturn"}
                            value={line.discount}
                            onChange={event =>
                              updateDraftLine(
                                line.id,
                                "discount",
                                event.target.value
                              )
                            }
                          />
                        </Field>
                        <Field label="إجمالي البند">
                          <output className="flex h-10 items-center rounded-lg border border-border bg-muted/50 px-3 text-xs font-black">
                            {money(lineTotal, form.currency)}
                          </output>
                        </Field>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={
                              draftLines.length === 1 ||
                              form.type === "purchaseReturn"
                            }
                            onClick={() => removeDraftLine(line.id)}
                            className="w-full"
                          >
                            حذف
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-sm font-bold text-muted-foreground">
                    إجمالي المسودة
                  </span>
                  <strong className="text-lg">
                    {money(draftTotal, form.currency)}
                  </strong>
                </div>
              </section>
              <div className="mt-4">
                <Field label={t.note}>
                  <input
                    value={form.note}
                    onChange={event =>
                      setForm({ ...form, note: event.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsNewOpen(false);
                    resetDraft();
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  aria-label={editingDocumentId !== null ? "حفظ تعديل المسودة" : "حفظ مسودة"}
                  disabled={
                    createDocument.isPending || updateDocumentDraft.isPending
                  }
                  className="bg-blue-700 hover:bg-blue-800"
                >
                  {(createDocument.isPending ||
                    updateDocumentDraft.isPending) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingDocumentId !== null ? "حفظ التعديل وترحيله" : t.save}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-2xl font-black">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </article>
  );
}
function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`grid gap-2 text-sm font-bold [&>input]:h-10 [&>input]:rounded-lg [&>input]:border [&>input]:border-border [&>input]:bg-background [&>input]:px-3 [&>input]:font-normal [&>select]:h-10 [&>select]:rounded-lg [&>select]:border [&>select]:border-border [&>select]:bg-background [&>select]:px-3 [&>select]:font-normal ${className}`}
    >
      {label}
      {children}
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}
function DocumentList({
  documents,
  t,
  money,
  canSubmit,
  canApprove,
  canEditHistorical,
  onSubmit,
  onCancel,
  onApprove,
  onEdit,
}: {
  documents: Array<{
    id: number;
    documentNumber: string;
    status: string;
    totalMinor: number;
    currencyCode: string;
    createdAt: Date;
    partnerName?: string | null;
    canEditDraft?: boolean;
    canEditPosted?: boolean;
  }>;
  t: typeof ar;
  money: (value: number, currency?: string) => string;
  canSubmit: boolean;
  canApprove: boolean;
  canEditHistorical: boolean;
  onSubmit: (id: number) => void;
  onCancel: (id: number) => void;
  onApprove: (id: number) => void;
  onEdit?: (id: number) => void;
}) {
  return (
    <div className="mt-4 space-y-3">
      {documents.map(document => (
        <article
          key={document.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
        >
          <div>
            <p className="font-black">{document.documentNumber}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {document.partnerName ?? "—"} ·{" "}
              {formatDateTime(document.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              {money(document.totalMinor, document.currencyCode)}
            </span>
            <span
              className={`rounded-lg px-2 py-1 text-xs font-bold ${statusClass[document.status] ?? "bg-muted"}`}
            >
              {document.status === "draft"
                ? t.draft
                : document.status === "pendingApproval"
                  ? t.pending
                  : document.status === "posted"
                    ? t.posted
                    : document.status}
            </span>
            {canEditHistorical && document.status === "posted" && document.canEditPosted && onEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(document.id)}
              >
                تعديل وترحيل
              </Button>
            )}
            {canSubmit && document.status === "draft" && (
              <>
                {document.canEditDraft && onEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(document.id)}
                  >
                    تعديل المسودة
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSubmit(document.id)}
                >
                  {t.submit}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onCancel(document.id)}
                  className="text-red-700 hover:bg-red-50"
                >
                  إلغاء المسودة
                </Button>
              </>
            )}
            {canApprove && document.status === "pendingApproval" && (
              <Button
                size="sm"
                onClick={() => onApprove(document.id)}
                className="bg-blue-700 hover:bg-blue-800"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t.approve}
              </Button>
            )}
          </div>
        </article>
      ))}
      {!documents.length && <Empty text={t.noData} />}
    </div>
  );
}

function PayrollLineEditor({
  line,
  saving,
  onSave,
}: {
  line: {
    employeeName: string;
    workingDays?: number;
    overtimeMinutes?: number;
    overtimeMinor?: number;
    grossMinor: number;
    advanceMinor: number;
    deductionMinor: number;
    netMinor: number;
  };
  saving: boolean;
  onSave: (advanceMinor: number, deductionMinor: number) => void;
}) {
  const [advance, setAdvance] = useState(String(line.advanceMinor));
  const [deduction, setDeduction] = useState(String(line.deductionMinor));
  return (
    <tr className="border-t border-border">
      <td className="p-3 font-bold">{line.employeeName}</td>
      <td className="p-3">{line.workingDays ?? 0}</td>
      <td className="p-3">{line.overtimeMinutes ?? 0} د</td>
      <td className="p-3">{line.overtimeMinor ?? 0}</td>
      <td className="p-3">{line.grossMinor}</td>
      <td className="p-3">
        <input
          aria-label={`سلفة ${line.employeeName}`}
          type="number"
          min="0"
          value={advance}
          onChange={event => setAdvance(event.target.value)}
          className="h-9 w-24 rounded-lg border border-border bg-background px-2"
        />
      </td>
      <td className="p-3">
        <input
          aria-label={`استقطاع ${line.employeeName}`}
          type="number"
          min="0"
          value={deduction}
          onChange={event => setDeduction(event.target.value)}
          className="h-9 w-24 rounded-lg border border-border bg-background px-2"
        />
      </td>
      <td className="p-3 font-black">{line.netMinor}</td>
      <td className="p-3">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave(
              Math.max(0, Number(advance) || 0),
              Math.max(0, Number(deduction) || 0)
            )
          }
        >
          حفظ
        </Button>
      </td>
    </tr>
  );
}
