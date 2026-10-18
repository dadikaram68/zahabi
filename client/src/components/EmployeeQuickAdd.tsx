import React, { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function EmployeeQuickAdd() {
  const utils = trpc.useUtils();
  const configuration = trpc.accounting.configuration.useQuery();
  const [form, setForm] = useState({ fullName: "", employeeNumber: "", salaryAmount: "", salaryCurrencyCode: "USD", salaryExchangeRate: "1" });
  const currencies = Array.from(new Set((configuration.data?.currencies ?? []).map(currency => currency.code)));
  const createEmployee = trpc.accounting.createEmployee.useMutation({
    onSuccess: async () => {
      toast.success("تمت إضافة الموظف. يمكنك الآن تسجيل حضوره وإنشاء مسير راتبه.");
      setForm({ fullName: "", employeeNumber: "", salaryAmount: "", salaryCurrencyCode: "USD", salaryExchangeRate: "1" });
      await Promise.all([utils.accounting.configuration.invalidate(), utils.accounting.payrollDetails.invalidate()]);
    },
    onError: error => toast.error(error.message),
  });
  const isValid = Boolean(form.fullName.trim() && form.employeeNumber.trim() && form.salaryAmount && Number(form.salaryAmount) >= 0 && Number(form.salaryExchangeRate) > 0);
  return <article className="rounded-3xl border border-blue-100 bg-blue-50/40 p-6 shadow-sm">
    <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-700 text-white"><UserPlus className="h-5 w-5" /></div><div><h3 className="font-black">إضافة موظف للرواتب</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">ابدأ من هنا عند إضافة موظف جديد. اختر عملة الراتب؛ النظام يحفظها كما أدخلتها ويحسب مكافئ USD للتقارير والمسير.</p></div></div>
    <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!isValid) return; createEmployee.mutate({ fullName: form.fullName.trim(), employeeNumber: form.employeeNumber.trim(), salaryAmount: Number(form.salaryAmount), salaryCurrencyCode: form.salaryCurrencyCode, salaryExchangeRate: Number(form.salaryExchangeRate) }); }}>
      <label className="grid gap-1.5 text-sm font-bold">الاسم الكامل<input aria-label="اسم الموظف الجديد" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" required /></label>
      <label className="grid gap-1.5 text-sm font-bold">رقم الموظف<input aria-label="رقم الموظف الجديد" value={form.employeeNumber} onChange={event => setForm({ ...form, employeeNumber: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" required /></label>
      <label className="grid gap-1.5 text-sm font-bold">قيمة الراتب الشهري<input aria-label="قيمة راتب الموظف الجديد" type="number" min="0" value={form.salaryAmount} onChange={event => setForm({ ...form, salaryAmount: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" required /></label>
      <label className="grid gap-1.5 text-sm font-bold">عملة الراتب<select aria-label="عملة راتب الموظف الجديد" value={form.salaryCurrencyCode} onChange={event => setForm({ ...form, salaryCurrencyCode: event.target.value, salaryExchangeRate: event.target.value === "USD" ? "1" : form.salaryExchangeRate })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal">{(currencies.length ? currencies : ["USD", "IQD"]).map(code => <option key={code} value={code}>{code}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-bold md:col-span-2">سعر التحويل إلى USD لكل وحدة عملة<input aria-label="سعر تحويل راتب الموظف الجديد" type="number" min="0.000001" step="any" value={form.salaryExchangeRate} onChange={event => setForm({ ...form, salaryExchangeRate: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" required /></label>
      <div className="md:col-span-2"><Button type="submit" disabled={!isValid || createEmployee.isPending} className="bg-blue-700 hover:bg-blue-800">{createEmployee.isPending && <Loader2 className="h-4 w-4 animate-spin" />}إضافة الموظف</Button></div>
    </form>
  </article>;
}
