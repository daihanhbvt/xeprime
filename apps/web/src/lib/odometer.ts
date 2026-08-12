/**
 * Hiển thị số KM. Tách khỏi component vì cả tab bảo dưỡng, Trung tâm bảo dưỡng và header
 * hồ sơ xe đều hiển thị KM, và cả ba phải nói cùng một thứ khi thiếu dữ liệu.
 *
 * Luật §9 của docs/design/12: thiếu số thì nói `Chưa có`, KHÔNG bịa `0 km`.
 */
const KM_FORMAT = new Intl.NumberFormat('vi-VN');

export const MISSING_VALUE_LABEL = 'Chưa có';
/** Thiếu thành phần để tính mốc bảo dưỡng (§9) — dùng nguyên văn ở mọi surface. */
export const INSUFFICIENT_DATA_LABEL = 'Chưa đủ dữ liệu';

/** `45230` → `"45.230 km"`; `null` → `"Chưa có"` (không phải `"0 km"`). */
export function formatKm(value: number | null | undefined): string {
  if (value == null) return MISSING_VALUE_LABEL;
  return `${KM_FORMAT.format(value)} km`;
}

/** Số KM không kèm đơn vị — cho ô nhập và các chỗ đã có nhãn "km" riêng. */
export function formatKmNumber(value: number | null | undefined): string {
  return value == null ? MISSING_VALUE_LABEL : KM_FORMAT.format(value);
}

/**
 * KM còn lại tới mốc bảo dưỡng, diễn đạt theo hướng người đọc cần: còn bao nhiêu, hay đã
 * vượt bao nhiêu. `null` = chưa đủ dữ liệu để kết luận.
 */
export function formatRemainingKm(value: number | null | undefined): string {
  if (value == null) return INSUFFICIENT_DATA_LABEL;
  if (value <= 0) return `Quá hạn ${KM_FORMAT.format(Math.abs(value))} km`;
  return `Còn ${KM_FORMAT.format(value)} km`;
}
