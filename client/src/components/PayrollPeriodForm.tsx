import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PayrollPeriodForm({ isPending, onCreate }: { isPending: boolean; onCreate: (input: { name: string; periodStart: Date; periodEnd: Date }) => void }) {
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    };
  });
  const isValid = Boolean(period.start && period.end && period.end >= period.start);
  const submit = () => {
    if (!isValid) return;
    onCreate({
      name: `رواتب ${new Date(`${period.start}T00:00:00`).toLocaleDateString("ar-IQ", { month: "long", year: "numeric" })}`,
      periodStart: new Date(`${period.start}T00:00:00.000Z`),
      periodEnd: new Date(`${period.end}T23:59:59.999Z`),
    });
  };
  return <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
    <h3 className="font-black">مسير الرواتب</h3>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">يعتمد المسير سياسة B: الغياب لا يخصم تلقائياً؛ الإضافي يحسب 1.5 من أجر الساعة، وتبقى السلف والاستقطاعات بيد المدير.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">بداية الفترة<input type="date" value={period.start} onChange={event => setPeriod({ ...period, start: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" /></label>
      <label className="grid gap-2 text-sm font-bold">نهاية الفترة<input type="date" value={period.end} onChange={event => setPeriod({ ...period, end: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" /></label>
    </div>
    <Button onClick={submit} disabled={isPending || !isValid} className="mt-5 rounded-xl bg-blue-700 hover:bg-blue-800">{isPending && <Loader2 className="h-4 w-4 animate-spin" />}إنشاء مسير رواتب</Button>
  </article>;
}
