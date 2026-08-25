/**
 * Dung lượng tệp cho MẮT NGƯỜI: `1258291` → `1.2 MB`.
 *
 * Không đi qua `useAppFormat`: đơn vị nhị phân (KB/MB) là ký hiệu kỹ thuật giống nhau ở mọi ngôn
 * ngữ, và người dùng đối chiếu nó với con số Windows/macOS hiện ra — đổi theo ngôn ngữ chỉ làm
 * hai bên hết khớp. Phần dịch được duy nhất là dấu thập phân, và nó không đáng một tham số locale
 * ở một nhãn dài chín ký tự.
 */
const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Byte không có phần lẻ (0.5 byte là vô nghĩa); từ KB trở lên giữ một chữ số cho đủ phân biệt.
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}
