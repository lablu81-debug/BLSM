import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const TODAY = (() => {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
})();

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const target = new Date(Date.UTC(y, m, d));
    return Math.ceil((target.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
}

export const RAG = {
  green: {
    name: 'Green',
    title: 'Active / Compliant',
    bg: '#EAF3DE',
    fg: '#3B6D11',
    text: 'The license is valid and up to date. No immediate action is required; regular monitoring remains in place until the standard renewal window opens.',
    action: 'No action — keep monitoring'
  },
  amber: {
    name: 'Amber',
    title: 'Action Required / Approaching Expiration',
    bg: '#FAEEDA',
    fg: '#854F0B',
    text: 'The renewal window is open (e.g., 30–60 days before expiration). Initiate the renewal process now to avoid processing delays, regulatory lapses, or late penalties.',
    action: 'Initiate renewal now'
  },
  red: {
    name: 'Red',
    title: 'Critical / Expired or Non-Compliant',
    bg: '#FCEBEB',
    fg: '#A32D2D',
    text: 'The license has expired or is suspended. Operations must cease immediately where permitted activity depends on this license, and urgent escalation/remediation is required.',
    action: 'Escalate and remediate urgently'
  }
};

export function getThresholdForLicense(
  licenseType: string,
  globalAlertThreshold: number,
  licenseThresholds: Record<string, number> = {}
): number {
  return licenseThresholds[licenseType] !== undefined
    ? licenseThresholds[licenseType]
    : globalAlertThreshold;
}

export function statusColor(
  days: number | null,
  licenseType: string,
  status: string,
  globalThreshold = 60,
  licenseThresholds: Record<string, number> = {}
): 'green' | 'amber' | 'red' | 'gray' {
  if (status === 'Suspended') return 'red';
  if (days === null) return 'gray';
  if (days < 0 || status === 'Expired') return 'red';
  const thresh = getThresholdForLicense(licenseType, globalThreshold, licenseThresholds);
  if (days <= thresh) return 'amber';
  return 'green';
}

export function statusLabel(
  days: number | null,
  status: string,
  licenseType: string,
  globalThreshold = 60,
  licenseThresholds: Record<string, number> = {}
): string {
  if (status === 'Expired' || status === 'Suspended' || (days !== null && days < 0)) return 'Expired';
  const thresh = getThresholdForLicense(licenseType, globalThreshold, licenseThresholds);
  if (days !== null && days <= thresh) return 'Expiring Soon';
  return status || 'Valid';
}

export function pct(n: number, total: number): string {
  if (!total) return '0%';
  const v = Math.round((n / total) * 1000) / 10;
  return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)) + '%';
}

export function genLNo(company: string, year: string, idx: number): string {
  return `${year}_${company}_${String(idx + 1).padStart(3, '0')}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtTs(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function relTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  return Math.floor(h / 24) + ' d ago';
}

export function escHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtSize(n: number): string {
  return n >= 1048576
    ? (n / 1048576).toFixed(1) + ' MB'
    : Math.max(1, Math.round(n / 1024)) + ' KB';
}

export function docExt(name: string): string {
  return (String(name).split('.').pop() || '').toLowerCase();
}

// Download file helper (works reliably across dev, iframe, and standard browsers)
export async function downloadFile(filename: string, blob: Blob): Promise<boolean> {
  try {
    // If Claude / AI Studio environment has a downloads tool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (win.claude && typeof win.claude.use === 'function') {
      try {
        const downloads = await win.claude.use('downloads');
        if (downloads && typeof downloads.save === 'function') {
          await downloads.save({ filename, data: blob });
          return true;
        }
      } catch {
        // Fall back to DOM download
      }
    }

    // Standard browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (err) {
    console.error('Download error:', err);
    return false;
  }
}

// Export PDF helper
export function generatePdfBlob(options: {
  title: string;
  metaLine: string;
  summaryLines?: string[];
  columns: string[];
  rows: (string | number)[][];
}): Blob | null {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const marginX = 40;
    let y = 44;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(options.title, marginX, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(options.metaLine, marginX, y);
    y += 16;

    if (options.summaryLines && options.summaryLines.length) {
      doc.setFontSize(8);
      options.summaryLines.forEach(line => {
        const wrapped = doc.splitTextToSize(line, doc.internal.pageSize.getWidth() - marginX * 2);
        doc.text(wrapped, marginX, y);
        y += wrapped.length * 10 + 4;
      });
    }

    doc.setTextColor(0);
    autoTable(doc, {
      startY: y,
      head: [options.columns],
      body: options.rows,
      styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [27, 54, 93], textColor: 255 },
      margin: { left: marginX, right: marginX },
      theme: 'grid'
    });

    return doc.output('blob');
  } catch (e) {
    console.error('PDF generation error:', e);
    return null;
  }
}

// Export Excel helper (ExcelJS is loaded on demand; it replaced the vulnerable SheetJS "xlsx" package)
export async function generateExcelBlob(
  sheetName: string,
  columns: string[],
  rows: (string | number)[][]
): Promise<Blob | null> {
  try {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(sheetName.substring(0, 31));
    ws.addRow(columns).font = { bold: true };
    rows.forEach(r => ws.addRow(r));
    ws.columns.forEach((col, i) => {
      const longest = Math.max(String(columns[i] ?? '').length, ...rows.map(r => String(r[i] ?? '').length));
      col.width = Math.min(60, Math.max(10, longest + 2));
    });
    const out = await wb.xlsx.writeBuffer();
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  } catch (e) {
    console.error('Excel generation error:', e);
    return null;
  }
}

/** Reads the first sheet of an .xlsx or .csv file into row objects keyed by header text. */
export async function readSpreadsheetRows(buffer: ArrayBuffer, fileName: string): Promise<Record<string, any>[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(fileName)) {
    const text = new TextDecoder().decode(buffer);
    return parseCsv(text);
  }
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col] = String(cell.text ?? '').trim(); });
  const out: Record<string, any>[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj: Record<string, any> = {};
    let any = false;
    headers.forEach((hd, col) => {
      if (!hd) return;
      let v: any = row.getCell(col).value;
      if (v && typeof v === 'object' && !(v instanceof Date)) v = (v as any).result ?? (v as any).text ?? '';
      if (v instanceof Date) v = v.toISOString().split('T')[0];
      obj[hd] = v ?? '';
      if (v !== '' && v != null) any = true;
    });
    if (any) out.push(obj);
  });
  return out;
}

function parseCsv(text: string): Record<string, any>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      cur.push(field); field = ''; rows.push(cur); cur = [];
    } else field += c;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim() !== ''));
  if (!head) return [];
  return body.map(r => Object.fromEntries(head.map((hd, i) => [hd.trim(), r[i] ?? ''])));
}

// Export CSV helper
export function generateCsvBlob(columns: string[], rows: (string | number)[][]): Blob {
  const allRows = [columns, ...rows];
  const csvContent = allRows
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
}
