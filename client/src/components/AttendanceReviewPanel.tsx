import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Employee = { id: number; fullName: string };
type AttendanceState = "present" | "absent" | "leave" | "holiday";

const attendanceStatusLabel: Record<AttendanceState, string> = { present: "حاضر", absent: "غائب", leave: "إجازة", holiday: "عطلة" };
const approvalStatusLabel: Record<"draft" | "pendingApproval" | "approved", string> = { draft: "مسودة", pendingApproval: "بانتظار المراجعة", approved: "معتمد" };

export function AttendanceReviewPanel({ employees, canApprove }: { employees: Employee[]; canApprove: boolean }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ employeeId: "", workDate: new Date().toISOString().slice(0, 10), status: "present" as AttendanceState, overtimeMinutes: "0" });
  const attendance = trpc.accounting.attendance.useQuery();
  const refresh = () => Promise.all([utils.accounting.attendance.invalidate(), utils.accounting.payrollDetails.invalidate()]);
  const record = trpc.accounting.recordAttendance.useMutation({ onSuccess: async () => { toast.success("سُجل الحضور كمسودة للمراجعة"); await refresh(); }, onError: error => toast.error(error.message) });
  const submit = trpc.accounting.submitAttendance.useMutation({ onSuccess: async () => { toast.success("أُرسل سجل الحضور للمراجعة"); await refresh(); }, onError: error => toast.error(error.message) });
  const approve = trpc.accounting.approveAttendance.useMutation({ onSuccess: async () => { toast.success("اعتمد سجل الحضور وأصبح متاحاً للمسير"); await refresh(); }, onError: error => toast.error(error.message) });

  return <article className="rounded-3xl border border-border bg-card p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">مراجعة الحضور قبل الرواتب</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">لا يدخل المسير إلا السجلات المعتمدة داخل الفترة. سجّل الحضور ثم أرسله للمراجعة قبل إنشاء المسير.</p></div></div>
    <form className="mt-5 grid gap-3 md:grid-cols-5" onSubmit={event => { event.preventDefault(); record.mutate({ employeeId: Number(form.employeeId), workDate: new Date(`${form.workDate}T00:00:00.000Z`), status: form.status, overtimeMinutes: Number(form.overtimeMinutes) }); }}>
      <label className="grid gap-2 text-sm font-bold md:col-span-2">الموظف<select required value={form.employeeId} onChange={event => setForm({ ...form, employeeId: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal"><option value="">اختر الموظف</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">التاريخ<input required type="date" value={form.workDate} onChange={event => setForm({ ...form, workDate: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" /></label>
      <label className="grid gap-2 text-sm font-bold">الحالة<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value as AttendanceState })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal">{Object.entries(attendanceStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-bold">دقائق إضافية<input min="0" type="number" value={form.overtimeMinutes} onChange={event => setForm({ ...form, overtimeMinutes: event.target.value })} className="h-10 rounded-lg border border-border bg-background px-3 font-normal" /></label>
      <div className="md:col-span-5"><Button disabled={record.isPending || !form.employeeId} className="bg-blue-700 hover:bg-blue-800">{record.isPending && <Loader2 className="h-4 w-4 animate-spin" />}تسجيل مسودة حضور</Button></div>
    </form>
    <div className="mt-6 overflow-auto rounded-2xl border border-border"><table className="w-full min-w-[720px] text-right text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">الموظف</th><th className="p-3">التاريخ</th><th className="p-3">الحالة</th><th className="p-3">الإضافي</th><th className="p-3">المراجعة</th><th className="p-3"></th></tr></thead><tbody>{attendance.data?.map(row => <tr key={row.id} className="border-t border-border"><td className="p-3 font-bold">{row.employeeName}</td><td className="p-3">{new Date(row.workDate).toLocaleDateString("ar-IQ")}</td><td className="p-3">{attendanceStatusLabel[row.status]}</td><td className="p-3">{row.overtimeMinutes} د</td><td className="p-3"><span className={`rounded-lg px-2 py-1 text-xs font-bold ${row.approvalStatus === "approved" ? "bg-emerald-100 text-emerald-800" : row.approvalStatus === "pendingApproval" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{approvalStatusLabel[row.approvalStatus]}</span></td><td className="p-3">{row.approvalStatus === "draft" && <Button size="sm" variant="outline" disabled={submit.isPending} onClick={() => submit.mutate({ attendanceId: row.id })}>إرسال للمراجعة</Button>}{canApprove && row.approvalStatus === "pendingApproval" && <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ attendanceId: row.id })}>اعتماد</Button>}</td></tr>)}</tbody></table>{!attendance.data?.length && <p className="p-5 text-center text-sm text-muted-foreground">لا توجد سجلات حضور بعد.</p>}</div>
  </article>;
}
