import type { DriverAssignmentRow } from './types';

/**
 * Nhãn của bảng kê — truyền từ component (đã dịch theo ngôn ngữ đang dùng). Hàm dựng không biết
 * ngôn ngữ nào, nên bảng kê ra đúng tiếng của người bấm tải.
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

/**
 * BOM UTF-8 — Excel trên Windows đọc CSV không BOM bằng codepage hệ thống và mọi tên có dấu thành
 * ký tự lạ. Dựng từ mã ký tự: một BOM dán thẳng vào mã nguồn thì không ai thấy khi review.
 */
const UTF8_BOM = String.fromCharCode(0xfeff);

/** Bọc một ô CSV — dấu phẩy, ngoặc kép, xuống dòng trong tên xe đều có thật. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Bảng kê tiền công một tài xế trong một tháng (ADR 0075) — chủ xe dùng để đối chiếu khi trả
 * tiền cho tài xế. Tiền là số VND nguyên KHÔNG định dạng (Excel cộng được); dòng cuối là tổng
 * của các con số đã ghi. Lượt trước tính năng (chưa có số) để trống, không ghi 0.
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
  return UTF8_BOM + lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Tải một chuỗi CSV về máy — blob tạm, thu hồi ngay sau khi trình duyệt nhận lượt tải. */
export function downloadCsv(fileName: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
