import React, { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function InternalLoginForm({ onOwnerLogin }: { onOwnerLogin: () => void }) {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [ownerLoginPending, setOwnerLoginPending] = useState(false);
  const login = trpc.auth.internalLogin.useMutation({
    onSuccess: async user => {
      if ("requiresMfa" in user && user.requiresMfa) {
        setChallengeToken(user.challengeToken);
        setPassword("");
        toast.success("أدخل الرمز الظاهر في تطبيق Authenticator");
        return;
      }
      utils.auth.me.setData(undefined, user);
      await utils.auth.me.invalidate();
      setPassword("");
      toast.success(`أهلاً ${user.name ?? user.username}`);
    },
    onError: error => toast.error(error.message),
  });
  const verifyMfa = trpc.auth.verifyMfa.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); setChallengeToken(""); setMfaCode(""); toast.success("تم التحقق والدخول بنجاح"); },
    onError: error => toast.error(error.message),
  });
  const handleOwnerLogin = () => {
    setOwnerLoginPending(true);
    try {
      onOwnerLogin();
    } catch (error) {
      setOwnerLoginPending(false);
      toast.error("تعذر فتح تسجيل دخول المالك. حاول مرة أخرى.");
    }
  };
  return <div className="space-y-5 text-right">
    <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex items-center gap-2 text-blue-800"><KeyRound className="h-4 w-4" /><p className="text-sm font-black">دخول الموظفين اليومي</p></div>
      <p className="mt-1 text-xs leading-5 text-blue-900/70">أدخل اسم الدخول وكلمة المرور التي أنشأها المالك أو المدير المفوّض. لا تستخدم هذا النموذج لدخول المالك الخارجي.</p>
    </div>
    {challengeToken ? <form className="grid gap-3" onSubmit={event => { event.preventDefault(); verifyMfa.mutate({ challengeToken, code: mfaCode }); }}><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">تم قبول كلمة المرور. افتح تطبيق Authenticator المرتبط بالحساب وأدخل الرمز المؤقت من 6 أرقام.</div><label className="grid gap-1.5 text-sm font-bold">رمز Authenticator<input aria-label="رمز Authenticator" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 rounded-xl border border-border bg-background px-3 text-center text-lg tracking-[0.4em]" required /></label><Button type="submit" disabled={verifyMfa.isPending || mfaCode.length !== 6} className="h-11 rounded-xl bg-[#0f2d52] text-base font-black">{verifyMfa.isPending && <Loader2 className="h-4 w-4 animate-spin" />}تحقق ودخول</Button><Button type="button" variant="outline" onClick={() => setChallengeToken("")}>العودة لتسجيل الدخول</Button></form> : <form className="grid gap-3" onSubmit={event => { event.preventDefault(); login.mutate({ username, password }); }}>
      <label className="grid gap-1.5 text-sm font-bold">اسم الدخول<input aria-label="اسم الدخول اليومي" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-normal" required /></label>
      <label className="grid gap-1.5 text-sm font-bold">كلمة المرور<input aria-label="كلمة المرور اليومية" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 font-normal" required /></label>
      <Button type="submit" disabled={login.isPending || !username.trim() || password.length < 10} className="h-11 rounded-xl bg-[#0f2d52] text-base font-black hover:bg-[#183f6d]">{login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}دخول الموظف</Button>
    </form>}
    <div className="relative py-1 text-center text-xs text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-border"><span className="relative bg-card px-3">أو</span></div>
    <Button type="button" variant="outline" onClick={handleOwnerLogin} disabled={ownerLoginPending} aria-busy={ownerLoginPending} className="h-11 w-full rounded-xl">
      {ownerLoginPending ? <><Loader2 className="h-4 w-4 animate-spin" /> جارٍ فتح تسجيل دخول المالك…</> : "دخول المالك الخارجي"}
    </Button>
    {ownerLoginPending && <p role="status" aria-live="polite" className="text-center text-xs font-bold text-blue-800">يتم نقلك إلى بوابة المالك الآمنة…</p>}
  </div>;
}
