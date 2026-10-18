export type ReportCell = string | number | null | undefined;

export type ReportSection = {
  title: string;
  columns: string[];
  rows: ReportCell[][];
};

function escapeHtml(value: ReportCell) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sectionHtml(section: ReportSection) {
  return `<section><h2>${escapeHtml(section.title)}</h2><table><thead><tr>${section.columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${section.rows.map(row => `<tr>${section.columns.map((_, index) => `<td>${escapeHtml(row[index])}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

export function exportReportToExcel(filename: string, title: string, sections: ReportSection[]) {
  const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;direction:rtl}h1{font-size:20px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;margin-bottom:18px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:right}th{background:#e2e8f0;font-weight:700}</style></head><body><h1>${escapeHtml(title)}</h1>${sections.map(sectionHtml).join("")}</body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${filename}.xls`);
}

export function printReportToPdf(title: string, sections: ReportSection[]) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1100,height=800");
  if (!printWindow) return false;
  printWindow.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#0f172a;direction:rtl}h1{font-size:22px;margin:0 0 18px}h2{font-size:16px;margin:22px 0 8px;border-bottom:2px solid #2563eb;padding-bottom:5px}table{border-collapse:collapse;width:100%;font-size:11px;margin-bottom:16px}th,td{border:1px solid #cbd5e1;padding:5px;text-align:right}th{background:#e2e8f0;font-weight:700}section{break-inside:avoid}</style></head><body><h1>${escapeHtml(title)}</h1>${sections.map(sectionHtml).join("")}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 250);
  return true;
}
