import { formatDateTime } from "@/lib/dateTime";
import { trpc } from "@/lib/trpc";
import {
  exportReportToExcel,
  printReportToPdf,
  type ReportSection,
} from "@/lib/reportExport";
import { Button } from "@/components/ui/button";
import {
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  Upload,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { toast } from "sonner";

type InventoryImportRow = {
  sheet: string;
  name: string;
  color: string;
  size: string;
  barcode: string;
  quantity: number;
  threshold: number | null;
  imageIndex?: number;
};
function binaryToDataUrl(content: unknown, path: string) {
  const bytes =
    content instanceof Uint8Array
      ? content
      : new Uint8Array(content as ArrayBuffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(
      ...Array.from(bytes.subarray(index, index + chunk))
    );
  const extension = path.split(".").pop()?.toLowerCase() ?? "png";
  const mime =
    extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "webp"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${btoa(binary)}`;
}
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const raw = String(value ?? "")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[,،\s]/g, "");
  const numbers = raw.match(/\d+(?:[.]\d+)?/g) ?? [];
  const total = numbers.reduce((sum, token) => sum + Number(token), 0);
  return Number.isFinite(total) && total >= 0 ? Math.floor(total) : 0;
};
export const inventoryImportKey = (row: InventoryImportRow) =>
  [row.name, row.color, row.size, row.barcode]
    .map(value => value.trim().toLocaleLowerCase())
    .join("|");
export const findDuplicateImportIndices = (rows: InventoryImportRow[]) => {
  const seen = new Set<string>();
  const duplicates: number[] = [];
  rows.forEach((row, index) => {
    const key = inventoryImportKey(row);
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });
  return duplicates;
};
export async function parseWorkbook(buffer: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, {
    type: "array",
    bookFiles: true,
    cellDates: true,
  });
  const rows: InventoryImportRow[] = [];
  for (const sheet of workbook.SheetNames) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], {
      header: 1,
      raw: true,
      defval: "",
    });
    if (!values.length) continue;
    const headerCandidates = values.slice(0, 25).map((row, index) => {
      const cells = row.map(text);
      const score = cells.reduce(
        (total, value) =>
          total +
          (/اسم المادة|صنف|مادة|item|material|name/i.test(value) ? 2 : 0) +
          (/code|باركود|رمز/i.test(value) ? 2 : 0) +
          (/كمية|عدد|quantity|qty|stock/i.test(value) ? 2 : 0),
        0
      );
      return { index, score };
    });
    const headerIndex =
      headerCandidates.sort((a, b) => b.score - a.score)[0]?.index ?? 0;
    const header = (values[headerIndex] ?? []).map(text);
    const find = (patterns: RegExp[]) =>
      header.findIndex(value => patterns.some(pattern => pattern.test(value)));
    const findLast = (patterns: RegExp[]) =>
      header.reduce(
        (found, value, index) =>
          patterns.some(pattern => pattern.test(value)) ? index : found,
        -1
      );
    const nameIndex =
      find([
        /اسم المادة.*إنكليزية|اسم المادة.*انكليزية|english|item name|material name/i,
      ]) >= 0
        ? find([
            /اسم المادة.*إنكليزية|اسم المادة.*انكليزية|english|item name|material name/i,
          ])
        : find([/صنف|مادة|اسم|item|material|name/i]);
    const colorIndex = find([/لون|color/i]);
    const sizeIndex = find([/قياس|حجم|size/i]);
    const barcodeIndex = findLast([/^code$/i, /barcode|باركود|رمز/i]);
    const quantityIndex = find([/كمية|عدد|quantity|qty|stock/i]);
    const thresholdIndex = find([/حد|minimum|threshold|reorder/i]);
    if (nameIndex < 0) continue;
    for (const raw of values.slice(Math.max(0, headerIndex) + 1)) {
      const name = text(raw[nameIndex]);
      if (!name || /^total|المجموع|الإجمالي/i.test(name)) continue;
      rows.push({
        sheet,
        name,
        color: colorIndex >= 0 ? text(raw[colorIndex]) : "",
        size: sizeIndex >= 0 ? text(raw[sizeIndex]) : "",
        barcode: barcodeIndex >= 0 ? text(raw[barcodeIndex]) : "",
        quantity: quantityIndex >= 0 ? number(raw[quantityIndex]) : 0,
        threshold:
          thresholdIndex >= 0 && text(raw[thresholdIndex])
            ? number(raw[thresholdIndex])
            : null,
        imageIndex: rows.length,
      });
    }
  }
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const imageEntries = Object.entries(zip.files).filter(
    ([path, entry]) => /^xl\/media\//i.test(path) && !entry.dir
  );
  const imageDataUrls = await Promise.all(
    imageEntries
      .slice(0, 50)
      .map(async ([path, entry]) =>
        binaryToDataUrl(await entry.async("uint8array"), path)
      )
  );
  return {
    rows: rows.slice(0, 5000),
    sheets: workbook.SheetNames,
    imageCount: imageEntries.length,
    imageDataUrls,
  };
}

export function buildInventoryImportBatchSections(
  batches: Array<{
    fileName: string;
    mode: string;
    status: string;
    totalRows: number;
    createdRows: number;
    updatedRows: number;
    failedRows: number;
    createdAt: string | Date;
  }>
): ReportSection[] {
  const statusLabel = (status: string) =>
    status === "rolled_back"
      ? "تم التراجع"
      : status === "completed"
        ? "مكتملة"
        : status === "failed"
          ? "فاشلة"
          : "قيد التنفيذ";
  return [
    {
      title: "سجل دفعات استيراد المخزن",
      columns: [
        "الملف",
        "الطريقة",
        "الحالة",
        "إجمالي الصفوف",
        "أصناف منشأة",
        "أصناف محدثة",
        "صفوف فاشلة",
        "التاريخ",
      ],
      rows: batches.map(batch => [
        batch.fileName,
        batch.mode === "update" ? "تحديث" : "إنشاء",
        statusLabel(batch.status),
        batch.totalRows,
        batch.createdRows,
        batch.updatedRows,
        batch.failedRows,
        formatDateTime(batch.createdAt),
      ]),
    },
  ];
}

export function InventoryWorkbookImporter() {
  const utils = trpc.useUtils();
  const [rows, setRows] = useState<InventoryImportRow[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [duplicates, setDuplicates] = useState<number[]>([]);
  const [imageCount, setImageCount] = useState(0);
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    completed: 0,
    total: 0,
    failed: 0,
  });
  const [lastImportedIds, setLastImportedIds] = useState<number[]>([]);
  const [lastBatchId, setLastBatchId] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<"create" | "update">("create");
  const [fileName, setFileName] = useState("");
  const addItem = trpc.inventory.addItem.useMutation();
  const deleteItems = (
    trpc.inventory as typeof trpc.inventory & { deleteItems?: any }
  ).deleteItems?.useMutation?.() ?? {
    mutateAsync: async () => ({ deleted: 0 }),
  };
  const uploadImage = (
    trpc.inventory as typeof trpc.inventory & { uploadImage?: any }
  ).uploadImage?.useMutation?.() ?? {
    mutateAsync: async () => ({ url: "", key: "" }),
  };
  const inventoryApi = trpc.inventory as typeof trpc.inventory & {
    importBatches?: any;
    createImportBatch?: any;
    importRow?: any;
    completeImportBatch?: any;
    rollbackImportBatch?: any;
  };
  const importBatchesQuery = inventoryApi.importBatches?.useQuery?.() ?? {
    data: [] as any[],
  };
  const createImportBatch =
    inventoryApi.createImportBatch?.useMutation?.() ?? null;
  const importRow = inventoryApi.importRow?.useMutation?.() ?? null;
  const completeImportBatch =
    inventoryApi.completeImportBatch?.useMutation?.() ?? null;
  const rollbackImportBatch =
    inventoryApi.rollbackImportBatch?.useMutation?.() ?? null;
  const sheetNames = useMemo(
    () => Array.from(new Set(rows.map(row => row.sheet))),
    [rows]
  );
  const duplicateCount = useMemo(
    () => findDuplicateImportIndices(rows),
    [rows]
  );
  const uniqueRows = useMemo(
    () =>
      rows.filter(
        (row, index) =>
          selectedSheets.includes(row.sheet) &&
          !excluded.includes(index) &&
          !duplicateCount.includes(index)
      ),
    [rows, selectedSheets, excluded, duplicateCount]
  );
  const selectFile = async (file?: File) => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name))
      return toast.error("اختر ملف Excel بصيغة XLSX أو XLS أو CSV");
    setLoading(true);
    setFileName(file.name);
    try {
      const parsed = await parseWorkbook(await file.arrayBuffer());
      setRows(parsed.rows);
      setSelectedSheets(
        parsed.sheets.filter(sheet =>
          parsed.rows.some(row => row.sheet === sheet)
        )
      );
      setExcluded([]);
      setDuplicates(parsed.rows.flatMap((_, index) => []));
      setImageCount(parsed.imageCount);
      setImageDataUrls(parsed.imageDataUrls);
      toast.success(
        `تمت معاينة ${parsed.rows.length} صنف${parsed.imageCount ? ` واكتشاف ${parsed.imageCount} صورة مضمّنة` : ""}`
      );
    } catch {
      toast.error("تعذر قراءة ملف المخزن");
    } finally {
      setLoading(false);
    }
  };
  const importRows = async () => {
    if (!uniqueRows.length) return toast.error("اختر صفوفاً صالحة للاستيراد");
    if (!createImportBatch || !importRow || !completeImportBatch)
      return toast.error(
        "نسخة الواجهة الحالية لا تدعم سجل دفعات الاستيراد؛ أعد تحميل الصفحة"
      );
    setLoading(true);
    setProgress({ completed: 0, total: uniqueRows.length, failed: 0 });
    setLastImportedIds([]);
    setLastBatchId(null);
    let batch: { id: number };
    try {
      batch = await createImportBatch.mutateAsync({
        fileName: fileName || "ملف مخزن",
        mode: importMode,
        totalRows: uniqueRows.length,
      });
    } catch {
      setLoading(false);
      return toast.error("تعذر إنشاء سجل دفعة الاستيراد");
    }
    setLastBatchId(batch.id);
    const importedIds: number[] = [];
    let imported = 0;
    let updated = 0;
    let failed = 0;
    for (let position = 0; position < uniqueRows.length; position += 1) {
      const row = uniqueRows[position]!;
      try {
        const imageDataUrl =
          row.imageIndex !== undefined ? imageDataUrls[row.imageIndex] : undefined;
        const image = imageDataUrl
          ? await uploadImage.mutateAsync({ dataUrl: imageDataUrl })
          : null;
        const result = await importRow.mutateAsync({
          batchId: batch.id,
          mode: importMode,
          name: row.name,
          color: row.color || null,
          size: row.size || null,
          barcode: row.barcode || null,
          quantity: row.quantity,
          lowStockThreshold: row.threshold,
          imageUrl: image?.url || null,
          imageKey: image?.key || null,
        });
        importedIds.push(result.itemId);
        if (result.action === "updated") updated += 1;
        else imported += 1;
      } catch {
        failed += 1;
      }
      setProgress({
        completed: position + 1,
        total: uniqueRows.length,
        failed,
      });
    }
    try {
      await completeImportBatch.mutateAsync({
        batchId: batch.id,
        failedRows: failed,
      });
    } catch {
      toast.error("تم تنفيذ الصفوف لكن تعذر إغلاق سجل الدفعة؛ راجعه من السجل");
    }
    setLastImportedIds(importedIds);
    setLoading(false);
    await utils.inventory.overview.invalidate();
    await utils.inventory.history.invalidate();
    await utils.inventory.importBatches.invalidate();
    toast.success(
      `تم إنشاء ${imported} وتحديث ${updated} صنف${failed ? ` وتعذر ${failed}` : ""}`
    );
    setRows([]);
    setSelectedSheets([]);
    setImageDataUrls([]);
  };
  const rollbackLastImport = async (requestedBatchId?: number) => {
    const targetBatchId = requestedBatchId ?? lastBatchId;
    if (targetBatchId && rollbackImportBatch) {
      setLoading(true);
      try {
        const result = await rollbackImportBatch.mutateAsync({
          batchId: targetBatchId,
        });
        setLastBatchId(null);
        setLastImportedIds([]);
        setProgress({ completed: 0, total: 0, failed: 0 });
        await utils.inventory.overview.invalidate();
        await utils.inventory.history.invalidate();
        await utils.inventory.importBatches.invalidate();
        toast.success(`تم التراجع عن ${result.restored} سجل من آخر دفعة`);
      } catch {
        toast.error("تعذر التراجع عن آخر دفعة؛ راجع سجل الدفعات");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!lastImportedIds.length) return;
    setLoading(true);
    try {
      const result = await deleteItems.mutateAsync({ ids: lastImportedIds });
      setLastImportedIds([]);
      setProgress({ completed: 0, total: 0, failed: 0 });
      await utils.inventory.overview.invalidate();
      await utils.inventory.history.invalidate();
      toast.success(`تم التراجع عن ${result.deleted} صنف من آخر دفعة`);
    } catch {
      toast.error("تعذر التراجع عن آخر دفعة");
    } finally {
      setLoading(false);
    }
  };
  const exportBatchHistory = (format: "excel" | "pdf") => {
    const batches = (importBatchesQuery.data ?? []) as Array<{
      fileName: string;
      mode: string;
      status: string;
      totalRows: number;
      createdRows: number;
      updatedRows: number;
      failedRows: number;
      createdAt: string | Date;
    }>;
    if (!batches.length) return toast.error("لا يوجد سجل دفعات لتصديره");
    const sections = buildInventoryImportBatchSections(batches);
    if (format === "excel")
      exportReportToExcel(
        "سجل-دفعات-استيراد-المخزن",
        "سجل دفعات استيراد المخزن",
        sections
      );
    else if (!printReportToPdf("سجل دفعات استيراد المخزن", sections))
      toast.error("تعذر فتح نافذة PDF؛ اسمح بالنوافذ المنبثقة ثم أعد المحاولة");
  };

  return (
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm dark:border-blue-900/60 dark:bg-blue-950/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-700 text-white">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black">مستورد ملفات المخزن</h3>
            <p className="text-xs text-muted-foreground">
              معاينة، اختيار، تعديل وكشف التكرار قبل إدخال الأصناف
            </p>
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
          <Upload className="h-4 w-4" /> اختيار ملف Excel
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={event => void selectFile(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 text-sm font-bold">
        <span>طريقة الاستيراد:</span>
        <Button
          type="button"
          size="sm"
          variant={importMode === "create" ? "default" : "outline"}
          onClick={() => setImportMode("create")}
        >
          إنشاء أصناف جديدة
        </Button>
        <Button
          type="button"
          size="sm"
          variant={importMode === "update" ? "default" : "outline"}
          onClick={() => setImportMode("update")}
        >
          تحديث الأصناف الموجودة
        </Button>
        <span className="text-xs font-normal text-muted-foreground">
          في وضع التحديث تتم المطابقة بالاسم واللون والحجم أو الباركود.
        </span>
      </div>
      {loading && (
        <div className="mt-3 flex items-center gap-2 text-sm font-bold">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحليل الملف أو إدخال
          الأصناف…
        </div>
      )}
      {(loading || progress.total > 0) && progress.total > 0 && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-background p-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>
              تقدم الاستيراد: {progress.completed} من {progress.total}
            </span>
            <span>
              {Math.round((progress.completed / progress.total) * 100)}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{
                width: `${(progress.completed / progress.total) * 100}%`,
              }}
            />
          </div>
          {progress.failed > 0 && (
            <p className="mt-2 text-xs font-bold text-red-600">
              تعذر إدخال {progress.failed} صف؛ يمكنك مراجعتها وإعادة المحاولة.
            </p>
          )}
        </div>
      )}
      <div className="mt-4 rounded-xl border bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="font-black">سجل دفعات الاستيراد</h4>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => exportBatchHistory("excel")}
            >
              تصدير Excel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => exportBatchHistory("pdf")}
            >
              تصدير PDF
            </Button>
            <span className="text-xs text-muted-foreground">آخر 100 دفعة</span>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full min-w-[720px] text-right text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="p-2">الملف</th>
                <th className="p-2">الطريقة</th>
                <th className="p-2">النتيجة</th>
                <th className="p-2">التاريخ</th>
                <th className="p-2">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {(importBatchesQuery.data ?? []).map((batch: any) => (
                <tr key={batch.id} className="border-t">
                  <td className="p-2">{batch.fileName}</td>
                  <td className="p-2">
                    {batch.mode === "update" ? "تحديث" : "إنشاء"}
                  </td>
                  <td className="p-2">
                    {batch.status === "rolled_back"
                      ? "تم التراجع"
                      : `${batch.createdRows} إنشاء · ${batch.updatedRows} تحديث · ${batch.failedRows} فشل`}
                  </td>
                  <td className="p-2">
                    {formatDateTime(batch.createdAt)}
                  </td>
                  <td className="p-2">
                    {batch.status === "completed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                          setLastBatchId(batch.id);
                          void rollbackLastImport(batch.id);
                        }}
                      >
                        تراجع
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!importBatchesQuery.data?.length && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              لا توجد دفعات مسجلة بعد.
            </p>
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white px-3 py-1 dark:bg-card">
              {rows.length} صف
            </span>
            <span className="rounded-full bg-white px-3 py-1 dark:bg-card">
              {uniqueRows.length} محدد
            </span>
            <span className="rounded-full bg-white px-3 py-1 dark:bg-card">
              {duplicateCount.length} مكرر محتمل
            </span>
            {imageCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 dark:bg-card">
                <ImageIcon className="h-3.5 w-3.5" /> {imageCount} صورة مضمّنة
                قابلة للمراجعة
              </span>
            )}
          </div>
          {lastImportedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-xs font-bold">
                آخر دفعة محفوظة: {lastBatchId ?? "—"}. يمكنك التراجع عنها الآن.
              </p>
              <Button
                variant="outline"
                onClick={() => void rollbackLastImport()}
                disabled={loading}
                className="border-amber-500 font-black text-amber-700"
              >
                تراجع عن آخر دفعة
              </Button>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {sheetNames.map(sheet => (
              <label
                key={sheet}
                className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-bold"
              >
                <input
                  type="checkbox"
                  checked={selectedSheets.includes(sheet)}
                  onChange={event =>
                    setSelectedSheets(current =>
                      event.target.checked
                        ? [...current, sheet]
                        : current.filter(item => item !== sheet)
                    )
                  }
                />
                {sheet}
              </label>
            ))}
          </div>
          <div className="mt-3 max-h-80 overflow-auto rounded-xl border bg-background">
            <table className="w-full min-w-[850px] text-right text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-2">اختيار</th>
                  <th className="p-2">الورقة</th>
                  <th className="p-2">الصورة</th>
                  <th className="p-2">اسم الصنف</th>
                  <th className="p-2">اللون</th>
                  <th className="p-2">الحجم</th>
                  <th className="p-2">الباركود</th>
                  <th className="p-2">الكمية</th>
                  <th className="p-2">الحد الأدنى</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, index) => (
                  <tr key={`${row.sheet}-${index}`} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={
                          !excluded.includes(index) &&
                          !duplicateCount.includes(index)
                        }
                        onChange={event =>
                          setExcluded(current =>
                            event.target.checked
                              ? current.filter(item => item !== index)
                              : [...current, index]
                          )
                        }
                      />
                    </td>
                    <td className="p-2">{row.sheet}</td>
                    <td className="p-2">
                      {row.imageIndex !== undefined && imageDataUrls[row.imageIndex] ? (
                        <img
                          src={imageDataUrls[row.imageIndex]}
                          alt={`صورة ${row.name}`}
                          className="h-12 w-12 rounded-lg border border-border bg-muted object-contain"
                        />
                      ) : (
                        <span className="text-[11px] text-muted-foreground">لا توجد</span>
                      )}
                    </td>
                    <td className="p-2">
                      <input
                        value={row.name}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, name: event.target.value }
                                : item
                            )
                          )
                        }
                        className="h-8 w-40 rounded border bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.color}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, color: event.target.value }
                                : item
                            )
                          )
                        }
                        className="h-8 w-24 rounded border bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.size}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, size: event.target.value }
                                : item
                            )
                          )
                        }
                        className="h-8 w-20 rounded border bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={row.barcode}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? { ...item, barcode: event.target.value }
                                : item
                            )
                          )
                        }
                        className="h-8 w-28 rounded border bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    quantity: number(event.target.value),
                                  }
                                : item
                            )
                          )
                        }
                        className="h-8 w-20 rounded border bg-background px-2"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={row.threshold ?? ""}
                        onChange={event =>
                          setRows(current =>
                            current.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    threshold: event.target.value
                                      ? number(event.target.value)
                                      : null,
                                  }
                                : item
                            )
                          )
                        }
                        className="h-8 w-20 rounded border bg-background px-2"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p className="p-2 text-xs text-muted-foreground">
                تظهر أول 100 صف للمعاينة؛ سيتم إدخال الصفوف المحددة كلها بعد
                التأكيد.
              </p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              تظهر الصورة المضمنة بجانب كل صف عند توفرها؛ راجع الصفوف قبل اعتمادها.
              لا يتم تغيير الأرقام الأصلية.
            </p>
            <Button
              onClick={() => void importRows()}
              disabled={loading}
              className="rounded-xl bg-emerald-700 font-black hover:bg-emerald-800"
            >
              استيراد {uniqueRows.length} صنف إلى المخزن
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
