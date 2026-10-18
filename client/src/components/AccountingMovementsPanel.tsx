import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDateTime } from "@/lib/dateTime";
import { exportReportToExcel, printReportToPdf, type ReportSection } from "@/lib/reportExport";
import { CalendarDays, FileSpreadsheet, FileText, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Language = "ar" | "en";

const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const formatMoney = (minor: number, currency: "IQD" | "USD", language: Language) =>
  new Intl.NumberFormat(language === "en" ? "en-US" : "ar-IQ-u-nu-latn", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: currency === "IQD" ? 0 : 2,
  }).format(minor / (currency === "USD" ? 100 : 1));

function DualAmount({
  amountMinor,
  currencyCode,
  marketExchangeRate,
  baseAmountMinor,
  language,
}: {
  amountMinor: number;
  currencyCode: string;
  marketExchangeRate: number;
  baseAmountMinor: number;
  language: Language;
}) {
  const usdMinor = currencyCode === "USD" ? amountMinor : baseAmountMinor;
  const iqdMinor = currencyCode === "IQD"
    ? amountMinor
    : Math.round((amountMinor / 100) * marketExchangeRate);
  return (
    <div className="space-y-0.5 whitespace-nowrap text-sm font-black tabular-nums">
      <div className="text-blue-700 dark:text-blue-300">{formatMoney(iqdMinor, "IQD", language)}</div>
      <div className="text-emerald-700 dark:text-emerald-300">{formatMoney(usdMinor, "USD", language)}</div>
    </div>
  );
}

export function AccountingMovementsPanel({ language }: { language: Language }) {
  const isEnglish = language === "en";
  const [fromDate, setFromDate] = useState(dateKey());
  const [toDate, setToDate] = useState(dateKey());
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const paymentAccounts = trpc.accounting.paymentAccounts.useQuery();
  const reports = {
    iqd: trpc.accounting.cashPeriodReport.useQuery({
      fromDate,
      toDate,
      currencyCode: "IQD",
      paymentAccountId: paymentAccountId ? Number(paymentAccountId) : undefined,
    }),
    usd: trpc.accounting.cashPeriodReport.useQuery({
      fromDate,
      toDate,
      currencyCode: "USD",
      paymentAccountId: paymentAccountId ? Number(paymentAccountId) : undefined,
    }),
  };
  const branding = trpc.accounting.publicBranding.useQuery();
  const iqd = reports.iqd.data;
  const usd = reports.usd.data;
  const loading = reports.iqd.isLoading || reports.usd.isLoading;
  const error = reports.iqd.error || reports.usd.error;
  const entries = useMemo(() =>
    [...(iqd?.entries ?? []), ...(usd?.entries ?? [])].sort(
      (a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
    ), [iqd?.entries, usd?.entries]);

  const filteredEntries = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();
    if (!query) return entries;
    return entries.filter(entry =>
      [
        entry.voucherNumber,
        entry.description,
        entry.category,
        entry.paymentAccountName,
        entry.debitAccountName,
        entry.creditAccountName,
      ].some(value => String(value ?? "").toLocaleLowerCase().includes(query))
    );
  }, [entries, searchTerm]);

  const total = (key: "openingMinor" | "receiptMinor" | "spentMinor" | "closingMinor") => ({
    iqd: iqd?.totals[key] ?? 0,
    usd: usd?.totals[key] ?? 0,
    iqdUsdMinor: iqd?.totals[`${key.replace("Minor", "BaseMinor")}` as "openingBaseMinor" | "closingBaseMinor"] ?? 0,
  });
  const received = total("receiptMinor");
  const spent = total("spentMinor");
  const closing = total("closingMinor");
  const opening = total("openingMinor");
  const dualTotal = (value: ReturnType<typeof total>) => (
    <div className="space-y-0.5 tabular-nums">
      <div className="text-blue-700 dark:text-blue-300">{formatMoney(value.iqd, "IQD", language)}</div>
      <div className="text-emerald-700 dark:text-emerald-300">{formatMoney(value.usd, "USD", language)}</div>
    </div>
  );
  const reportSections: ReportSection[] = [
    {
      title: `${branding.data?.brandName || "الشركة"} — حركات المحاسبة من ${fromDate} إلى ${toDate}`,
      columns: ["البند", "بالدينار العراقي", "بالدولار الأمريكي"],
      rows: [
        ["الرصيد الافتتاحي", formatMoney(opening.iqd, "IQD", language), formatMoney(opening.usd, "USD", language)],
        ["المبلغ المستلم", formatMoney(received.iqd, "IQD", language), formatMoney(received.usd, "USD", language)],
        ["المصروف والمدفوع", formatMoney(spent.iqd, "IQD", language), formatMoney(spent.usd, "USD", language)],
        ["المتبقي في الصندوق", formatMoney(closing.iqd, "IQD", language), formatMoney(closing.usd, "USD", language)],
      ],
    },
    {
      title: "تفاصيل السندات والحركات",
      columns: ["التاريخ والوقت", "رقم السند", "البيان", "الفئة", "النوع", "القيمة بالدينار", "القيمة بالدولار", "الصندوق"],
      rows: filteredEntries.map(entry => {
        const rate = Number(entry.marketExchangeRate || 1570);
        const amountMinor = Number(entry.amountMinor);
        const usdMinor = entry.currencyCode === "USD" ? amountMinor : Number(entry.baseAmountMinor);
        const iqdMinor = entry.currencyCode === "IQD" ? amountMinor : Math.round((amountMinor / 100) * rate);
        return [
          formatDateTime(entry.createdAt ?? entry.entryDate, isEnglish ? "en" : "ar"),
          entry.voucherNumber || "—",
          entry.description,
          entry.category || "—",
          entry.entryType === "receipt" ? "مقبوض" : "مصروف / مدفوع",
          formatMoney(iqdMinor, "IQD", language),
          formatMoney(usdMinor, "USD", language),
          entry.paymentAccountName || "—",
        ];
      }),
    },
  ];
  const exportExcel = () => {
    if (loading) return;
    if (filteredEntries.length === 0) {
      toast.info(isEnglish ? "There are no movements in the selected period" : "لا توجد حركات ضمن الفترة المحددة");
      return;
    }
    exportReportToExcel(`accounting-movements-${fromDate}-${toDate}${searchTerm.trim() ? "-search" : ""}`, "حركات المحاسبة", reportSections);
  };
  const exportPdf = () => {
    if (loading) return;
    if (filteredEntries.length === 0) {
      toast.info(isEnglish ? "There are no movements in the selected period" : "لا توجد حركات ضمن الفترة المحددة");
      return;
    }
    if (!printReportToPdf("حركات المحاسبة", reportSections))
      toast.error(isEnglish ? "Could not open print preview" : "تعذر فتح معاينة PDF");
  };

  return (
    <section className="space-y-6 p-4 sm:p-7" dir={isEnglish ? "ltr" : "rtl"}>
      <div className="ops-card rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="ops-kicker">{isEnglish ? "ACCOUNTING MOVEMENTS" : "سجل مالي مستقل"}</p>
            <h1 className="mt-2 text-3xl font-black">{isEnglish ? "Accounting movements" : "حركات المحاسبة"}</h1>
            <p className="mt-2 text-sm font-bold text-muted-foreground">{isEnglish ? "Receipts, expenses, vouchers, balance, and full details" : "المقبوضات والمصروفات والسندات والمتبقي بكل التفاصيل"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950" onClick={exportExcel} disabled={loading}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950" onClick={exportPdf} disabled={loading}><FileText className="h-4 w-4" />PDF</Button>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <label className="space-y-2 text-sm font-black"><span>من تاريخ</span><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3" /></label>
          <label className="space-y-2 text-sm font-black"><span>إلى تاريخ</span><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3" /></label>
          <label className="space-y-2 text-sm font-black"><span>الصندوق / المصرف</span><select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3"><option value="">كل الصناديق</option>{(paymentAccounts.data ?? []).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <div className="flex items-end"><Button variant="outline" className="h-11 w-full gap-2" onClick={() => { setFromDate(dateKey()); setToDate(dateKey()); }}><CalendarDays className="h-4 w-4" />اليوم</Button></div>
          <label className="relative space-y-2 text-sm font-black md:col-span-4"><span>بحث برقم السند أو البيان</span><Search className="pointer-events-none absolute right-3 top-10 h-4 w-4 text-muted-foreground" /><input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="مثال: رقم السند أو اسم العملية أو البيان" className="h-11 w-full rounded-xl border bg-background px-10" />{searchTerm && <button type="button" aria-label="مسح البحث" onClick={() => setSearchTerm("")} className="absolute left-3 top-9 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}</label>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">تعذر تحميل حركات المحاسبة. {error.message}</div>}
      {loading ? <div className="grid min-h-48 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-blue-700" /></div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[{ label: "الرصيد الافتتاحي", value: opening, tone: "text-slate-700" }, { label: "المبلغ المستلم", value: received, tone: "text-emerald-700" }, { label: "المصروف والمدفوع", value: spent, tone: "text-amber-700" }, { label: "المتبقي في الصندوق", value: closing, tone: "text-blue-700" }].map(card => <article key={card.label} className="ops-card rounded-2xl p-5"><p className="text-sm font-black text-muted-foreground">{card.label}</p><div className={`mt-3 text-lg font-black ${card.tone}`}>{dualTotal(card.value)}</div><p className="mt-2 text-xs font-bold text-muted-foreground">القيمة بالدينار والدولار</p></article>)}
          </div>
          <div className="ops-card overflow-hidden rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-xl font-black">كل السندات والحركات</h2><p className="mt-1 text-sm font-bold text-muted-foreground">{fromDate} — {toDate} · {filteredEntries.length} حركة{searchTerm.trim() ? ` (من ${entries.length})` : ""}</p></div><Button variant="outline" size="sm" onClick={() => { void reports.iqd.refetch(); void reports.usd.refetch(); }} className="gap-2"><RefreshCw className="h-4 w-4" />تحديث</Button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-muted/60"><tr>{["التاريخ والوقت", "رقم السند", "البيان", "الفئة", "النوع", "القيمة", "الصندوق"].map(header => <th key={header} className="p-4 text-right font-black">{header}</th>)}</tr></thead><tbody>{entries.map(entry => <tr key={`${entry.currencyCode}-${entry.id}`} className="border-t align-top"><td className="p-4 font-bold whitespace-nowrap">{formatDateTime(entry.createdAt ?? entry.entryDate, isEnglish ? "en" : "ar")}</td><td className="p-4 font-black">{entry.voucherNumber || "—"}</td><td className="p-4"><div className="font-black">{entry.description}</div><div className="mt-1 text-xs font-bold text-muted-foreground">{entry.debitAccountName} ← {entry.creditAccountName}</div></td><td className="p-4 font-bold">{entry.category || "—"}</td><td className={`p-4 font-black ${entry.entryType === "receipt" ? "text-emerald-700" : "text-amber-700"}`}>{entry.entryType === "receipt" ? "مقبوض" : "مصروف / مدفوع"}</td><td className="p-4"><DualAmount amountMinor={Number(entry.amountMinor)} currencyCode={entry.currencyCode} marketExchangeRate={Number(entry.marketExchangeRate || 1570)} baseAmountMinor={Number(entry.baseAmountMinor)} language={language} /></td><td className="p-4 font-bold">{entry.paymentAccountName || "—"}</td></tr>)}</tbody></table>{filteredEntries.length === 0 && <div className="p-12 text-center font-bold text-muted-foreground">{searchTerm.trim() ? "لا توجد نتائج مطابقة للبحث." : "لا توجد حركات ضمن الفترة المحددة."}</div>}</div>
          </div>
        </>
      )}
    </section>
  );
}
