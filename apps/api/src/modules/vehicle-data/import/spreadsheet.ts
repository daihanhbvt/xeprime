import { Workbook, type CellValue } from 'exceljs';

/** Một dòng của sheet: số dòng như Excel hiển thị + giá trị ô đã đổi sang chuỗi (đã trim). */
export interface SheetRow {
  rowNumber: number;
  cells: string[];
}

export interface Sheet {
  name: string;
  rows: SheetRow[];
}

export class SpreadsheetError extends Error {}

/** File xlsx là một zip — 4 byte đầu `PK\x03\x04`. */
function isZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03;
}

/**
 * Đọc file `.xlsx` hoặc `.csv` (UTF-8) thành các sheet dòng-chuỗi. Không tin đuôi file: nhận diện
 * theo nội dung. CSV không phải UTF-8 hợp lệ bị từ chối — Excel lưu "CSV" bằng bảng mã Windows
 * sẽ biến "Hà Nội" thành ký tự rác, và nhập rác vào danh mục tệ hơn là báo lỗi.
 */
export async function readSpreadsheet(buffer: Buffer, maxRows: number): Promise<Sheet[]> {
  if (isZip(buffer)) return readXlsx(buffer, maxRows);
  return [{ name: 'CSV', rows: readCsv(buffer, maxRows) }];
}

async function readXlsx(buffer: Buffer, maxRows: number): Promise<Sheet[]> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError('xlsx không đọc được');
  }
  const sheets: Sheet[] = [];
  let total = 0;
  workbook.eachSheet((worksheet) => {
    const rows: SheetRow[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cells[col - 1] = cellText(cell.value);
      });
      const filled = Array.from(cells, (c) => c ?? '');
      if (filled.some((c) => c !== '')) rows.push({ rowNumber, cells: filled });
    });
    total += rows.length;
    if (total > maxRows + 50) throw new SpreadsheetError('quá nhiều dòng');
    sheets.push({ name: worksheet.name.trim(), rows });
  });
  return sheets;
}

/** Giá trị ô exceljs → chuỗi. Số nguyên in không có ".0"; ngày in `YYYY-MM-DD`. */
export function cellText(value: CellValue): string {
  if (value == null) return '';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    if ('result' in value) return cellText((value.result ?? '') as CellValue);
    if ('text' in value) {
      // Ô hyperlink: chữ hiển thị có thể là chuỗi HOẶC rich text (Excel tô màu link). Ưu tiên địa
      // chỉ link khi chữ hiển thị không phải URL — cột "Link" của file khảo sát là đúng kiểu này.
      const text = cellText(value.text as CellValue);
      const link =
        'hyperlink' in value && typeof value.hyperlink === 'string' ? value.hyperlink.trim() : '';
      return /^https?:/i.test(text) || !link ? text : link;
    }
    if ('error' in value) return '';
  }
  return String(value).trim();
}

function readCsv(buffer: Buffer, maxRows: number): SheetRow[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new SpreadsheetError('csv không phải UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));
  // Excel bản tiếng Việt xuất CSV bằng ';' — chọn dấu xuất hiện nhiều hơn ở dòng tiêu đề.
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  return parseCsv(text, delimiter, maxRows);
}

/** CSV theo RFC 4180: ô trong ngoặc kép được chứa dấu phân cách, xuống dòng và `""`. */
export function parseCsv(text: string, delimiter: string, maxRows: number): SheetRow[] {
  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const pushRow = () => {
    cells.push(cell.trim());
    if (cells.some((c) => c !== '')) {
      rows.push({ rowNumber: rowStart, cells });
      if (rows.length > maxRows + 50) throw new SpreadsheetError('quá nhiều dòng');
    }
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      pushRow();
      line += 1;
      rowStart = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) pushRow();
  return rows;
}
