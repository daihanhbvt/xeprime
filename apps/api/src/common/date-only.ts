/**
 * Ngày nghiệp vụ KHÔNG mang giờ (`@db.Date`) — hạn GPLX, ngày khách muốn nhận xe, khoảng nhận
 * linh hoạt…
 *
 * Quy ước một chỗ: API nhận/trả chuỗi `YYYY-MM-DD` (ngày lịch Việt Nam), DB lưu cột `date`, và
 * Prisma nhận/trả `Date` ở NỬA ĐÊM UTC cho cột đó. Chuyển đổi qua lại phải đi qua đây — tự
 * `new Date(chuỗi)` rồi lưu sẽ lệch một ngày ngay khi máy chạy ở múi giờ khác UTC.
 */

/** `YYYY-MM-DD` — dùng cho `@Matches` ở DTO. */
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → giá trị ghi vào cột `@db.Date`. */
export function toDateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Cột `@db.Date` → `YYYY-MM-DD` cho JSON. */
export function fromDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
