import { BookOpenCheck, ChevronDown, CircleHelp } from "lucide-react";

type Language = "ar" | "en";
type SectionKey = "dashboard" | "accounting" | "accountingMovements" | "items" | "partners" | "invoices" | "backups" | "movements" | "reports";

const guides: Record<Language, Record<SectionKey, { title: string; summary: string; steps: string[] }>> = {
  ar: {
    dashboard: { title: "تعليمات لوحة التحكم", summary: "ابدأ من التنبيهات والحركات الحديثة لتعرف ما يحتاج متابعة الآن.", steps: ["راجع الأصناف الحمراء أولاً.", "افتح الحركات للتأكد من الإدخال والإخراج الأخير.", "افتح التقرير المناسب وحدد الفترة قبل المراجعة."] },
    accounting: { title: "تعليمات المحاسبة", summary: "أنشئ المستند وراجعه ثم سجله ضمن الدورة المحاسبية.", steps: ["تحقق من العملة وسعر الصرف والفرع.", "راجع الحسابات والبنود قبل الحفظ.", "راجع القيود والتقارير بعد التسجيل." ] },
    accountingMovements: { title: "تعليمات حركات المحاسبة", summary: "استخدم البحث والفترة الزمنية لمراجعة كل الفواتير والسندات والإدخالات المالية.", steps: ["حدد من تاريخ وإلى تاريخ أو استخدم البحث برقم الوصل والبيان.", "افتح التفاصيل لمراجعة المبلغ والعملة والحسابات والملاحظة.", "استخدم التراجع أو الإلغاء الموثق حسب الصلاحية عند الحاجة." ] },
    items: { title: "تعليمات الأصناف", summary: "استخدم الباركود والمتغيرات والحد الخاص للصنف لتحافظ على دقة الرصيد.", steps: ["ابحث بالاسم أو الباركود قبل إنشاء صنف جديد.", "اضبط حد تنبيه خاص عند اختلاف حساسية الصنف.", "سجّل كل تعديل في الرصيد عبر حركة مخزون موثقة."] },
    partners: { title: "تعليمات الموردين والعملاء", summary: "سجّل بيانات الشريك بدقة لتظهر المستندات والذمم بصورة قابلة للمراجعة.", steps: ["ميّز بين المورد والعميل قبل الحفظ.", "استخدم البحث لمنع تكرار السجلات.", "اربطه بالفاتورة ذات الصلة عند إنشائها."] },
    invoices: { title: "تعليمات الفواتير", summary: "راجع الطرف والبنود والكميات قبل الحفظ، ثم تابع حالة المستند حتى الترحيل.", steps: ["تحقق من الكمية والسعر والخصم لكل بند.", "اختر الحساب النقدي أو البنكي الصحيح لسندات القبض والصرف.", "لا تعدّل الأثر المالي يدوياً بعد الترحيل."] },
    backups: { title: "تعليمات النسخ الاحتياطي", summary: "أنشئ نسخة يدوية قبل أي تغيير كبير، واستعد النسخ بعد مراجعة التاريخ والمحتوى.", steps: ["نزّل نسخة مؤرخة عند الحاجة للأرشفة الخارجية.", "تأكد من التاريخ قبل الاستعادة.", "سيتم إنشاء نسخة أمان قبل الاستعادة تلقائياً."] },
    movements: { title: "تعليمات الحركات", summary: "سجل سبباً واضحاً لكل إدخال أو إخراج لتصبح المراجعة سهلة لاحقاً.", steps: ["لا تسجل إخراجاً أكبر من الرصيد المتاح.", "اكتب سبباً يمكن للمراجع فهمه.", "استخدم السجل للتحقق من أي فرق في المخزون."] },
    reports: { title: "تعليمات التقارير", summary: "استخدم التصدير والطباعة لمراجعة المخزون، وركّز على الأصناف ذات التنبيه الأحمر.", steps: ["راجع الفترة ومصدر البيانات قبل مشاركة التقرير.", "استخدم CSV للتحليل الخارجي عند الحاجة.", "تعامل مع التنبيهات كمؤشرات متابعة لا كأوامر تلقائية."] },
  },
  en: {
    dashboard: { title: "Dashboard guide", summary: "Start with alerts and recent movements to see what needs attention now.", steps: ["Review red inventory alerts first.", "Open movements to verify recent activity.", "Open the relevant report and select its period before reviewing."] },
    accounting: { title: "Accounting guide", summary: "Create, review, and record accounting documents within the accounting cycle.", steps: ["Confirm currency, exchange rate, and branch.", "Review accounts and lines before saving.", "Review journals and reports after recording."] },
    accountingMovements: { title: "Accounting movements guide", summary: "Use search and date ranges to review invoices, vouchers, and daily accounting entries.", steps: ["Choose a date range or search by voucher number and description.", "Open details to review amount, currency, accounts, and notes.", "Use documented reversal or cancellation according to your permission." ] },
    items: { title: "Items guide", summary: "Use barcodes, variants, and item thresholds to keep stock accurate.", steps: ["Search before creating a new item.", "Set a custom threshold where sensitivity differs.", "Record every stock change as a documented movement."] },
    partners: { title: "Partners guide", summary: "Maintain accurate partner data for reviewable documents and balances.", steps: ["Choose supplier or customer correctly.", "Search before adding a record.", "Link the partner to the relevant invoice."] },
    invoices: { title: "Invoice guide", summary: "Review partner, lines, and quantities before saving, then follow the document through posting.", steps: ["Verify quantity, price, and discount per line.", "Choose the correct cash or bank account for receipts and payments.", "Do not manually alter financial effects after posting."] },
    backups: { title: "Backup guide", summary: "Create a manual backup before major changes and review date and contents before restoring.", steps: ["Download a dated copy when external archiving is needed.", "Confirm the date before restoration.", "A safety backup is created before restoration."] },
    movements: { title: "Movements guide", summary: "Record a clear reason for every stock in or out so reviews remain straightforward.", steps: ["Do not issue more than available stock.", "Write a reason a reviewer can understand.", "Use the log to investigate inventory differences."] },
    reports: { title: "Reports guide", summary: "Use exports and printing to review inventory, focusing on red stock alerts.", steps: ["Confirm period and data source before sharing.", "Use CSV for external analysis when needed.", "Treat alerts as review signals, not automatic instructions."] },
  },
};

export function SectionGuide({ section, language }: { section: SectionKey; language: Language }) {
  const guide = guides[language][section];
  return <details className="ops-card mb-6 rounded-2xl" open={section === "dashboard"}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><BookOpenCheck className="h-5 w-5" /></div><div><p className="text-base font-black">{guide.title}</p><p className="mt-0.5 text-sm text-muted-foreground">{guide.summary}</p></div></div>
      <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
    </summary>
    <div className="border-t border-border/70 px-5 py-4"><div className="grid gap-3 lg:grid-cols-3">{guide.steps.map((step, index) => <div key={step} className="flex gap-3 rounded-xl bg-muted/55 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-700 text-xs font-black text-white">{index + 1}</span><p className="text-sm font-bold leading-6">{step}</p></div>)}</div><p className="mt-4 flex items-center gap-2 text-xs font-bold text-muted-foreground"><CircleHelp className="h-4 w-4" />{language === "ar" ? "تظهر هذه التعليمات داخل كل قسم لمساعدتك على استخدامه بأمان." : "These contextual instructions help you use each section safely."}</p></div>
  </details>;
}
