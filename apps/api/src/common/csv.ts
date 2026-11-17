/**
 * CSV cho người vận hành mở bằng Excel — dùng chung cho bảng kê trả hãng bảo hiểm và bảng kê lệnh
 * rút (đợt rà Admin 16/11/2026).
 *
 * BOM UTF-8 ở đầu file: Excel trên Windows đọc CSV không BOM bằng codepage hệ thống và mọi tên có
 * dấu thành ký tự lạ. Dựng từ MÃ ký tự thay vì dán ký tự thật: một BOM vô hình trong mã nguồn thì
 * không ai thấy khi review.
 */
export const BOM_UTF8 = String.fromCharCode(0xfeff);

/**
 * Ô CSV an toàn: luôn bọc ngoặc kép, nhân đôi ngoặc kép bên trong, và chặn công thức Excel — một ô
 * bắt đầu bằng `=`, `+`, `-`, `@` (trừ số nguyên âm) được thêm `'` để Excel đọc là chữ. Tên chủ ví
 * hay ghi chú do người dùng gõ là đầu vào không tin được.
 */
export function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  const safe = /^[=+\-@]/.test(v) && !/^-?\d+$/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Cả file: BOM + dòng tiêu đề + các dòng, xuống dòng CRLF như Excel mong đợi. */
export function csvDocument(
  header: readonly string[],
  lines: readonly (readonly string[])[],
): string {
  const body = [
    header.map(csvCell).join(','),
    ...lines.map((cells) => cells.map(csvCell).join(',')),
  ];
  return `${BOM_UTF8}${body.join('\r\n')}\r\n`;
}
