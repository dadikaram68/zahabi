import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Building2, FilePlus2, Loader2, ReceiptText, UserRoundPlus, UsersRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

type Language = "ar" | "en";

const copy = {
  ar: { partners: "الموردون والعملاء", supplier: "مورد", customer: "عميل", both: "مورد وعميل", partnerName: "الاسم", phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان", addPartner: "إضافة جهة", recentPartners: "سجل الجهات", invoices: "فواتير الشراء والصرف", purchase: "فاتورة شراء", issue: "فاتورة صرف", newInvoice: "فاتورة جديدة", selectPartner: "اختر الجهة", selectVariant: "اختر الصنف/المتغير", quantity: "الكمية", price: "سعر الوحدة", addLine: "إضافة بند", saveInvoice: "حفظ الفاتورة", recentInvoices: "أحدث الفواتير", stockChart: "توزيع المخزون حسب الأصناف", invoiceChart: "قيمة الشراء والصرف", noData: "لا توجد بيانات كافية حالياً.", total: "الإجمالي", note: "ملاحظة", lines: "بنود الفاتورة" },
  en: { partners: "Suppliers & customers", supplier: "Supplier", customer: "Customer", both: "Both", partnerName: "Name", phone: "Phone", email: "Email", address: "Address", addPartner: "Add partner", recentPartners: "Partner directory", invoices: "Purchase & issue invoices", purchase: "Purchase invoice", issue: "Issue invoice", newInvoice: "New invoice", selectPartner: "Select partner", selectVariant: "Select item / variant", quantity: "Quantity", price: "Unit price", addLine: "Add line", saveInvoice: "Save invoice", recentInvoices: "Recent invoices", stockChart: "Stock by item", invoiceChart: "Purchase vs issue value", noData: "No sufficient data yet.", total: "Total", note: "Note", lines: "Invoice lines" },
};

function useText(language: Language) { return copy[language]; }

export function AnalyticsCharts({ language }: { language: Language }) {
  const t = useText(language);
  const snapshot = trpc.commerce.invoices.snapshot.useQuery();
  const invoices = trpc.commerce.invoices.list.useQuery();
  const stockData = useMemo(() => {
    const totals = new Map<string, number>();
    snapshot.data?.forEach(row => totals.set(row.itemName, (totals.get(row.itemName) ?? 0) + row.stockQuantity));
    return Array.from(totals, ([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity).slice(0, 6);
  }, [snapshot.data]);
  const invoiceData = useMemo(() => {
    const totals = { purchase: 0, issue: 0 };
    invoices.data?.forEach(invoice => { totals[invoice.type] += invoice.totalAmount; });
    return [{ name: t.purchase, value: totals.purchase, color: "#2563eb" }, { name: t.issue, value: totals.issue, color: "#f59e0b" }];
  }, [invoices.data, t.issue, t.purchase]);
  return <section className="mt-7 grid gap-5 xl:grid-cols-2">
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm"><h3 className="font-black">{t.stockChart}</h3><div className="mt-4 h-64">{stockData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={stockData}><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="quantity" fill="#2563eb" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer> : <p className="pt-16 text-center text-sm text-muted-foreground">{t.noData}</p>}</div></article>
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm"><h3 className="font-black">{t.invoiceChart}</h3><div className="mt-4 h-64">{invoices.isLoading ? <Loader2 className="mx-auto mt-20 h-6 w-6 animate-spin" /> : <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={invoiceData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4}>{invoiceData.map(entry => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}</div><div className="flex justify-center gap-4 text-xs">{invoiceData.map(row => <span key={row.name} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />{row.name}: {row.value}</span>)}</div></article>
  </section>;
}

export function MovementTrendChart({ language }: { language: Language }) {
  const labels = language === "ar" ? { title: "اتجاه حركة المخزون", incoming: "إدخال", outgoing: "إخراج", empty: "لا توجد حركات مسجلة بعد." } : { title: "Stock movement trend", incoming: "Incoming", outgoing: "Outgoing", empty: "No movements recorded yet." };
  const history = trpc.inventory.history.useQuery();
  const trendData = useMemo(() => {
    const days = new Map<string, { date: string; incoming: number; outgoing: number }>();
    history.data?.forEach(row => {
      const raw = new Date(row.createdAt);
      const key = raw.toISOString().slice(0, 10);
      const date = raw.toLocaleDateString(language === "ar" ? "ar" : "en", { month: "short", day: "numeric" });
      const current = days.get(key) ?? { date, incoming: 0, outgoing: 0 };
      current[row.type === "in" ? "incoming" : "outgoing"] += row.quantity;
      days.set(key, current);
    });
    return Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-14).map(([, value]) => value);
  }, [history.data, language]);
  return <article className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-sm"><h3 className="font-black">{labels.title}</h3><div className="mt-4 h-64">{trendData.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trendData}><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="incoming" name={labels.incoming} stroke="#059669" strokeWidth={3} dot={{ r: 3 }} /><Line type="monotone" dataKey="outgoing" name={labels.outgoing} stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <p className="pt-16 text-center text-sm text-muted-foreground">{labels.empty}</p>}</div></article>;
}

export function PartnerManagement({ language }: { language: Language }) {
  const t = useText(language);
  const partners = trpc.commerce.partners.list.useQuery();
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ type: "supplier" as "supplier" | "customer" | "both", name: "", phone: "", email: "", address: "" });
  const createPartner = trpc.commerce.partners.create.useMutation({
    onSuccess: async () => { toast.success(t.addPartner); setForm({ type: "supplier", name: "", phone: "", email: "", address: "" }); await utils.commerce.partners.list.invalidate(); },
    onError: error => toast.error(error.message),
  });
  return <section className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]"><article className="rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><UserRoundPlus className="h-5 w-5" /></div><h2 className="text-xl font-black">{t.addPartner}</h2></div><form className="mt-6 space-y-3" onSubmit={(event: FormEvent) => { event.preventDefault(); createPartner.mutate({ type: form.type, name: form.name, phone: form.phone || null, email: form.email || null, address: form.address || null }); }}><select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as typeof form.type })} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="supplier">{t.supplier}</option><option value="customer">{t.customer}</option><option value="both">{t.both}</option></select><input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder={t.partnerName} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder={t.phone} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder={t.email} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /><textarea value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} placeholder={t.address} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /><Button disabled={createPartner.isPending} className="w-full rounded-xl bg-blue-700 hover:bg-blue-800">{createPartner.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t.addPartner}</Button></form></article><article className="rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-black">{t.recentPartners}</h2></div><div className="mt-5 divide-y divide-border/70">{partners.data?.map(partner => <div key={partner.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold">{partner.name}</p><p className="mt-1 text-xs text-muted-foreground">{partner.phone || partner.email || partner.address || "—"}</p></div><span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-bold">{partner.type === "supplier" ? t.supplier : partner.type === "customer" ? t.customer : t.both}</span></div>)}{partners.data?.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t.noData}</p>}</div></article></section>;
}

export function PartnerSearchResults({ language }: { language: Language }) {
  const labels = language === "ar" ? { title: "بحث وتصفية الجهات", search: "ابحث بالاسم أو الهاتف أو البريد", all: "الكل", supplier: "الموردون", customer: "العملاء", both: "مشترك", empty: "لا توجد نتائج مطابقة." } : { title: "Search & filter partners", search: "Search name, phone, or email", all: "All", supplier: "Suppliers", customer: "Customers", both: "Both", empty: "No matching results." };
  const partners = trpc.commerce.partners.list.useQuery();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "supplier" | "customer">("all");
  const results = useMemo(() => (partners.data ?? []).filter(partner => {
    const searchable = `${partner.name} ${partner.phone ?? ""} ${partner.email ?? ""}`.toLowerCase();
    return searchable.includes(query.trim().toLowerCase()) && (filter === "all" || partner.type === filter || partner.type === "both");
  }), [partners.data, query, filter]);
  return <article className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-black">{labels.title}</h2></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={query} onChange={event => setQuery(event.target.value)} placeholder={labels.search} className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm" /><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className="h-11 rounded-xl border border-border bg-background px-3 text-sm"><option value="all">{labels.all}</option><option value="supplier">{labels.supplier}</option><option value="customer">{labels.customer}</option></select></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{results.map(partner => <div key={partner.id} className="rounded-2xl bg-muted/40 p-4"><div className="flex items-center justify-between gap-2"><p className="font-bold">{partner.name}</p><span className="rounded-lg bg-card px-2 py-1 text-[11px] font-bold">{partner.type === "supplier" ? labels.supplier : partner.type === "customer" ? labels.customer : labels.both}</span></div><p className="mt-2 text-xs text-muted-foreground">{partner.phone || partner.email || partner.address || "—"}</p></div>)}{!partners.isLoading && results.length === 0 && <p className="py-7 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{labels.empty}</p>}</div></article>;
}

export function InvoiceManagement({ language }: { language: Language }) {
  const t = useText(language);
  const utils = trpc.useUtils();
  const partners = trpc.commerce.partners.list.useQuery();
  const snapshot = trpc.commerce.invoices.snapshot.useQuery();
  const invoices = trpc.commerce.invoices.list.useQuery();
  const [type, setType] = useState<"purchase" | "issue">("purchase");
  const [partnerId, setPartnerId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([{ variantId: "", quantity: "1", unitPrice: "0" }]);
  const eligiblePartners = partners.data?.filter(partner => partner.type === (type === "purchase" ? "supplier" : "customer") || partner.type === "both") ?? [];
  const createInvoice = trpc.commerce.invoices.create.useMutation({
    onSuccess: async () => { toast.success(t.saveInvoice); setPartnerId(""); setNote(""); setLines([{ variantId: "", quantity: "1", unitPrice: "0" }]); await Promise.all([utils.commerce.invoices.invalidate(), utils.inventory.overview.invalidate(), utils.inventory.history.invalidate()]); },
    onError: error => toast.error(error.message),
  });
  return <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><article className="rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><FilePlus2 className="h-5 w-5" /></div><h2 className="text-xl font-black">{t.newInvoice}</h2></div><div className="flex rounded-xl bg-muted p-1"><button onClick={() => setType("purchase")} className={`rounded-lg px-3 py-2 text-xs font-bold ${type === "purchase" ? "bg-card text-blue-700 shadow-sm" : "text-muted-foreground"}`}>{t.purchase}</button><button onClick={() => setType("issue")} className={`rounded-lg px-3 py-2 text-xs font-bold ${type === "issue" ? "bg-card text-amber-700 shadow-sm" : "text-muted-foreground"}`}>{t.issue}</button></div></div><form className="mt-6 space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); createInvoice.mutate({ type, partnerId: Number(partnerId), note: note || null, lines: lines.map(line => ({ variantId: Number(line.variantId), quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) })) }); }}><select required value={partnerId} onChange={event => setPartnerId(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">{t.selectPartner}</option>{eligiblePartners.map(partner => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select><div><div className="mb-2 flex items-center justify-between"><p className="font-bold">{t.lines}</p><button type="button" onClick={() => setLines([...lines, { variantId: "", quantity: "1", unitPrice: "0" }])} className="text-xs font-bold text-blue-700 hover:underline">+ {t.addLine}</button></div><div className="space-y-2">{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl bg-muted/40 p-2 sm:grid-cols-[1fr_86px_100px]"><select required value={line.variantId} onChange={event => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, variantId: event.target.value } : row))} className="h-10 rounded-lg border border-border bg-background px-2 text-xs"><option value="">{t.selectVariant}</option>{snapshot.data?.map(variant => <option key={variant.variantId} value={variant.variantId}>{variant.itemName} — {[variant.color, variant.size].filter(Boolean).join(" / ") || variant.barcode || "—"} ({variant.stockQuantity})</option>)}</select><input required min="1" type="number" value={line.quantity} onChange={event => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} className="h-10 rounded-lg border border-border bg-background px-2 text-sm" title={t.quantity} /><input min="0" type="number" value={line.unitPrice} onChange={event => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, unitPrice: event.target.value } : row))} className="h-10 rounded-lg border border-border bg-background px-2 text-sm" title={t.price} /></div>)}</div></div><textarea value={note} onChange={event => setNote(event.target.value)} placeholder={t.note} className="min-h-20 w-full rounded-xl border border-border bg-background p-3 text-sm" /><div className="flex items-center justify-between"><p className="text-sm font-bold">{t.total}: {lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0)}</p><Button disabled={createInvoice.isPending} className={type === "purchase" ? "rounded-xl bg-blue-700 hover:bg-blue-800" : "rounded-xl bg-amber-700 hover:bg-amber-800"}>{createInvoice.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{t.saveInvoice}</Button></div></form></article><article className="rounded-3xl border border-border bg-card p-6 shadow-sm"><div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-blue-700" /><h2 className="text-xl font-black">{t.recentInvoices}</h2></div><div className="mt-5 divide-y divide-border/70">{invoices.data?.map(invoice => <div key={invoice.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold">{invoice.invoiceNumber}</p><p className="mt-1 text-xs text-muted-foreground">{invoice.partnerName}</p></div><div className="text-end"><p className={`font-black ${invoice.type === "purchase" ? "text-blue-700" : "text-amber-700"}`}>{invoice.totalAmount}</p><p className="text-xs text-muted-foreground">{invoice.type === "purchase" ? t.purchase : t.issue}</p></div></div>)}{invoices.data?.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">{t.noData}</p>}</div></article></section>;
}
