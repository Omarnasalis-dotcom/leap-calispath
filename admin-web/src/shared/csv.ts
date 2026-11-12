/** One CSV cell: quoted when needed, and a leading = + - @ neutralised so a
 * spreadsheet never runs it as a formula (CSV injection). */
function cell(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds a CSV (header + rows) and downloads it. */
export function downloadCsv(fileName: string, header: string[], rows: unknown[][]): void {
  const text = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 (Arabic names) correctly.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
