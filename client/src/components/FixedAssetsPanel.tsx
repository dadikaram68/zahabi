import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Building2, Calculator, Landmark, Loader2, Plus } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

type Account = { id: number; code: string; name: string; type: string; isActive: boolean; acceptsPosting: boolean };
type Branch = { id: number; name: string; isActive?: boolean };

const usd = (minor: number) => new Intl.NumberFormat("ar-IQ", { style: "currency", currency: "USD", currencyDisplay: "code", maximumFractionDigits: 2 }).format(minor / 100);
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const nextMonthKey = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year!, month!, 1)));
};

export function FixedAssetsPanel({ accounts, branches }: { accounts: Account[]; branches: Branch[] }) {
  const utils = trpc.useUtils();
  const register = trpc.accounting.fixedAssets.useQuery();
  const [asset, setAsset] = useState({ assetNumber: "", name: "", acquiredAt: new Date().toISOString().slice(0, 10), acquisitionUsd: "", salvageUsd: "0", usefulLifeMonths: "60", branchId: "", assetAccountId: "", accumulatedDepreciationAccountId: "", depreciationExpenseAccountId: "", creditAccountId: "" });
  const [periodByAsset, setPeriodByAsset] = useState<Record<number, string>>({});
  const defaultAccountId = (code: string) => String(accounts.find(account => account.code === code && account.isActive && account.acceptsPosting)?.id ?? "");
  const selected = (value: string, code: string) => value || defaultAccountId(code);
  const invalidate = async () => {
    await Promise.all([
      utils.accounting.fixedAssets.invalidate(),
      utils.accounting.accounts.invalidate(),
      utils.accounting.journals.invalidate(),
      utils.accounting.reports.invalidate(),
      utils.accounting.overview.invalidate(),
    ]);
  };
  const createAsset = trpc.accounting.createFixedAsset.useMutation({
    onSuccess: async result => {
      toast.success(`تمت رسملة الأصل ${result.assetNumber} بقيد ${result.journalEntryId}`);
      setAsset(current => ({ ...current, assetNumber: "", name: "", acquisitionUsd: "", salvageUsd: "0" }));
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const postDepreciation = trpc.accounting.postFixedAssetDepreciation.useMutation({
    onSuccess: async result => {
      toast.success(`تم ترحيل إهلاك ${result.periodKey} بقيمة ${usd(result.depreciationMinor)}`);
      await invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const depreciationByAsset = useMemo(() => {
    const grouped = new Map<number, Array<{ periodKey: string; depreciationMinor: number; journalEntryId: number; entryNumber: string }>>();
    for (const row of register.data?.depreciation ?? []) grouped.set(row.assetId, [...(grouped.get(row.assetId) ?? []), row]);
    return grouped;
  }, [register.data?.depreciation]);
  const activeAccounts = accounts.filter(account => account.isActive && account.acceptsPosting);

  if (register.isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /></div>;
  const assets = register.data?.assets ?? [];
  return <section className="space-y-6">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm font-bold text-blue-700">إدارة الأصول الثابتة</p><h2 className="mt-1 text-3xl font-black">رسملة وإهلاك مضبوط بالدولار</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">يُنشئ الحفظ قيد رسملة مرحلاً فوراً: مدين حساب الأصل ودائن حساب التمويل المختار. يبدأ الإهلاك الخطي من بداية الشهر التالي للاستحواذ، ويُرحّل بالتسلسل فقط: مدين مصروف الإهلاك ودائن مجمع الإهلاك.</p></div><div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900"><Landmark className="h-5 w-5" />العملة الأساس: USD</div>
    </header>

    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-emerald-700">رسملة أصل جديد</p><h3 className="mt-1 text-xl font-black">تسجيل الأصل وقيد الاستحواذ</h3><p className="mt-1 text-sm text-muted-foreground">أدخل التكلفة والسعر المتبقي بوحدات الدولار؛ لا يتم حفظ سجل بلا قيد محاسبي متوازن.</p></div><Plus className="h-6 w-6 text-emerald-700" /></div>
      <form className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={event => { event.preventDefault(); createAsset.mutate({ assetNumber: asset.assetNumber, name: asset.name, acquiredAt: new Date(`${asset.acquiredAt}T00:00:00.000Z`), acquisitionMinor: Math.round(Number(asset.acquisitionUsd) * 100), salvageMinor: Math.round(Number(asset.salvageUsd) * 100), usefulLifeMonths: Number(asset.usefulLifeMonths), branchId: asset.branchId ? Number(asset.branchId) : undefined, assetAccountId: Number(selected(asset.assetAccountId, "1300")), accumulatedDepreciationAccountId: Number(selected(asset.accumulatedDepreciationAccountId, "1310")), depreciationExpenseAccountId: Number(selected(asset.depreciationExpenseAccountId, "6300")), creditAccountId: Number(selected(asset.creditAccountId, "1110")) }); }}>
        <Input label="رقم الأصل" value={asset.assetNumber} onChange={value => setAsset({ ...asset, assetNumber: value })} required placeholder="AST-2026-001" />
        <Input label="اسم الأصل" value={asset.name} onChange={value => setAsset({ ...asset, name: value })} required placeholder="حاسوب محاسب" />
        <Input label="تاريخ الاستحواذ" value={asset.acquiredAt} onChange={value => setAsset({ ...asset, acquiredAt: value })} required type="date" />
        <Select label="الفرع" value={asset.branchId} onChange={value => setAsset({ ...asset, branchId: value })} options={[["", "الفرع الافتراضي"], ...branches.filter(branch => branch.isActive !== false).map(branch => [String(branch.id), branch.name] as [string, string])]} />
        <Input label="تكلفة الاستحواذ USD" value={asset.acquisitionUsd} onChange={value => setAsset({ ...asset, acquisitionUsd: value })} required type="number" min="0.01" step="0.01" />
        <Input label="القيمة المتبقية USD" value={asset.salvageUsd} onChange={value => setAsset({ ...asset, salvageUsd: value })} required type="number" min="0" step="0.01" />
        <Input label="العمر الإنتاجي (شهر)" value={asset.usefulLifeMonths} onChange={value => setAsset({ ...asset, usefulLifeMonths: value })} required type="number" min="1" max="1200" />
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">المبلغ الشهري يُحسب خطياً عند الترحيل، مع حد القيمة المتبقية.</div>
        <Select label="حساب الأصل (مدين)" value={selected(asset.assetAccountId, "1300")} onChange={value => setAsset({ ...asset, assetAccountId: value })} options={activeAccounts.filter(account => account.type === "asset").map(account => [String(account.id), `${account.code} — ${account.name}`] as [string, string])} />
        <Select label="مجمع الإهلاك (دائن)" value={selected(asset.accumulatedDepreciationAccountId, "1310")} onChange={value => setAsset({ ...asset, accumulatedDepreciationAccountId: value })} options={activeAccounts.filter(account => account.type === "asset").map(account => [String(account.id), `${account.code} — ${account.name}`] as [string, string])} />
        <Select label="مصروف الإهلاك (مدين)" value={selected(asset.depreciationExpenseAccountId, "6300")} onChange={value => setAsset({ ...asset, depreciationExpenseAccountId: value })} options={activeAccounts.filter(account => account.type === "expense").map(account => [String(account.id), `${account.code} — ${account.name}`] as [string, string])} />
        <Select label="حساب تمويل الاستحواذ (دائن)" value={selected(asset.creditAccountId, "1110")} onChange={value => setAsset({ ...asset, creditAccountId: value })} options={activeAccounts.map(account => [String(account.id), `${account.code} — ${account.name}`] as [string, string])} />
        <div className="md:col-span-2 xl:col-span-4"><Button disabled={createAsset.isPending || !asset.assetNumber || !asset.name || Number(asset.acquisitionUsd) <= 0 || Number(asset.salvageUsd) < 0 || Number(asset.salvageUsd) >= Number(asset.acquisitionUsd)} className="bg-emerald-700 hover:bg-emerald-800">{createAsset.isPending && <Loader2 className="h-4 w-4 animate-spin" />}رسملة الأصل وإضافة السجل</Button></div>
      </form>
    </article>

    <section className="grid gap-4 md:grid-cols-3"><Stat label="الأصول المسجلة" value={String(assets.length)} icon={Building2} color="text-blue-700 bg-blue-50" /><Stat label="أصول نشطة" value={String(assets.filter(asset => asset.status === "active").length)} icon={Landmark} color="text-emerald-700 bg-emerald-50" /><Stat label="مجمع الإهلاك" value={usd(assets.reduce((total, current) => total + Number(current.accumulatedDepreciationMinor), 0))} icon={Calculator} color="text-violet-700 bg-violet-50" /></section>

    <section className="space-y-4">
      {assets.map(item => {
        const history = depreciationByAsset.get(item.id) ?? [];
        const latest = history[0];
        const recommended = latest ? nextMonthKey(latest.periodKey) : nextMonthKey(monthKey(new Date(item.acquiredAt)));
        const period = periodByAsset[item.id] ?? recommended;
        const netBookValue = Number(item.acquisitionMinor) - Number(item.accumulatedDepreciationMinor);
        return (
          <article key={item.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h3 className="text-xl font-black">{item.assetNumber} — {item.name}</h3><Status status={item.status} /></div>
                <p className="mt-2 text-sm text-muted-foreground">الفرع: {item.branchName ?? "الافتراضي"} · الاستحواذ: {new Date(item.acquiredAt).toLocaleDateString("ar-IQ")}</p>
              </div>
              <div className="rounded-2xl bg-muted/50 px-4 py-3 text-right"><p className="text-xs font-bold text-muted-foreground">صافي القيمة الدفترية</p><p className="mt-1 text-lg font-black">{usd(netBookValue)}</p></div>
            </div>
            <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_.85fr]">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label="التكلفة" value={usd(Number(item.acquisitionMinor))} /><Metric label="القيمة المتبقية" value={usd(Number(item.salvageMinor))} /><Metric label="مجمع الإهلاك" value={usd(Number(item.accumulatedDepreciationMinor))} /><Metric label="العمر" value={`${item.usefulLifeMonths} شهر`} />
                <Metric label="حساب الأصل" value={`${item.assetAccountCode} — ${item.assetAccountName}`} /><Metric label="مجمع الإهلاك" value={`${item.accumulatedDepreciationAccountCode} — ${item.accumulatedDepreciationAccountName}`} /><Metric label="مصروف الإهلاك" value={`${item.depreciationExpenseAccountCode} — ${item.depreciationExpenseAccountName}`} /><Metric label="آخر ترحيل" value={latest ? `${latest.periodKey} · ${usd(Number(latest.depreciationMinor))}` : "لم يُرحّل بعد"} />
              </dl>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                <p className="font-black text-violet-950">ترحيل إهلاك شهري</p><p className="mt-1 text-xs leading-5 text-violet-900">الشهر المقترح {recommended}. يمنع النظام تخطي شهر أو إعادة ترحيله.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input aria-label={`شهر إهلاك ${item.assetNumber}`} type="month" value={period} onChange={event => setPeriodByAsset(current => ({ ...current, [item.id]: event.target.value }))} className="h-10 rounded-lg border border-violet-200 bg-background px-3 text-sm" />
                  <Button size="sm" disabled={postDepreciation.isPending || item.status !== "active" || !period} onClick={() => { const approved = window.confirm(`ترحيل إهلاك الأصل ${item.assetNumber} عن ${period}؟`); if (approved) postDepreciation.mutate({ assetId: item.id, periodKey: period }); }} className="bg-violet-700 hover:bg-violet-800">{postDepreciation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}ترحيل الإهلاك</Button>
                </div>
                {history.length > 0 && <p className="mt-3 text-xs text-violet-900">سجل حديث: {history.slice(0, 3).map(row => `${row.periodKey} (${row.entryNumber})`).join("، ")}</p>}
              </div>
            </div>
          </article>
        );
      })}
      {!assets.length && <div className="grid min-h-44 place-items-center rounded-3xl border border-dashed border-border bg-card p-6 text-center"><div><Building2 className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-3 font-black">لا توجد أصول ثابتة مسجلة</p><p className="mt-1 text-sm text-muted-foreground">ابدأ برسملة أصل جديد من النموذج أعلاه؛ سيُنشأ السجل وقيد الاستحواذ معاً.</p></div></div>}
    </section>
  </section>;
}

function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string; min?: string; max?: string; step?: string }) { return <label className="grid gap-2 text-sm font-bold">{label}<input value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" {...props} /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <label className="grid gap-2 text-sm font-bold">{label}<select value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 font-normal">{options.map(([optionValue, label]) => <option key={optionValue || "default"} value={optionValue}>{label}</option>)}</select></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-muted/55 p-3"><dt className="text-xs font-bold text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-black">{value}</dd></div>; }
function Stat({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof Landmark; color: string }) { return <article className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-xl font-black">{value}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></article>; }
function Status({ status }: { status: string }) { const style = status === "active" ? "bg-emerald-100 text-emerald-800" : status === "fullyDepreciated" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"; const label = status === "active" ? "نشط" : status === "fullyDepreciated" ? "مُهلك بالكامل" : "مستبعد"; return <span className={`rounded-lg px-2 py-1 text-xs font-bold ${style}`}>{label}</span>; }
