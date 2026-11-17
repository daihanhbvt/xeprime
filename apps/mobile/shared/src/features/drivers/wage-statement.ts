import { driversApi, type DriverAssignmentRow } from './api';

/**
 * Bảng kê tiền công một tài xế trong một tháng (ADR 0075) - bản native của web
 * `features/drivers/wage-statement.ts`. Chủ xe dùng để đối chiếu khi trả tiền cho tài xế; XePrime
 * không giữ hay chi khoản này.
 */
export interface WageStatementLabels {
  headers: {
    booking: string;
    vehicle: string;
    plate: string;
    pickupAt: string;
    returnAt: string;
    days: string;
    outcome: string;
    wage: string;
  };
  total: string;
  outcome: (outcome: string) => string;
  dateTime: (iso: string) => string;
}

/** BOM UTF-8 - Excel trên Windows đọc CSV không BOM sẽ hỏng chữ có dấu (như web). */
const UTF8_BOM = String.fromCharCode(0xfeff);
const CR_LF = String.fromCharCode(13, 10);

/** Bọc một ô CSV - dấu phẩy, ngoặc kép, xuống dòng trong tên xe đều có thật. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Tiền là số VND nguyên KHÔNG định dạng (Excel cộng được); dòng cuối là tổng các con số đã ghi;
 * lượt chưa có số để trống, không ghi 0. Cộng `Number` chỉ cho dòng tổng của bảng kê - như web.
 */
export function wageStatementCsv(
  rows: readonly DriverAssignmentRow[],
  labels: WageStatementLabels,
): string {
  const h = labels.headers;
  const lines: string[][] = [
    [h.booking, h.vehicle, h.plate, h.pickupAt, h.returnAt, h.days, h.outcome, h.wage],
  ];
  let total = 0;
  for (const row of rows) {
    if (row.wageAmount !== null) total += Number(row.wageAmount);
    lines.push([
      row.bookingCode,
      row.vehicleName,
      row.vehiclePlate ?? '',
      labels.dateTime(row.pickupAt),
      labels.dateTime(row.returnAt),
      row.wageDays === null ? '' : String(row.wageDays),
      labels.outcome(row.outcome),
      row.wageAmount ?? '',
    ]);
  }
  lines.push([labels.total, '', '', '', '', '', '', String(total)]);
  return UTF8_BOM + lines.map((cells) => cells.map(csvCell).join(',')).join(CR_LF) + CR_LF;
}

/** Web `DRIVER_ASSIGNMENTS_EXPORT_LIMIT` / `_MAX_PAGES`. */
const EXPORT_LIMIT = 100;
const EXPORT_MAX_PAGES = 50;

/** MỌI chuyến của một tài xế trong tháng - cùng endpoint với tab, trang lớn (web `fetchAllDriverAssignments`). */
export async function fetchAllDriverAssignments(
  id: string,
  month: string | undefined,
): Promise<DriverAssignmentRow[]> {
  const rows: DriverAssignmentRow[] = [];
  for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
    const result = await driversApi.assignments(id, {
      ...(month ? { month } : {}),
      page,
      limit: EXPORT_LIMIT,
    });
    rows.push(...result.items);
    if (!result.meta.hasNext) break;
  }
  return rows;
}
