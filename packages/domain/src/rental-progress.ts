/**
 * Tiến độ của một chuyến đang chạy và kết cục giờ trả — dùng chung web ↔ native.
 *
 * Nằm ở domain vì "đã đi bao nhiêu" và "trả trễ" là LUẬT, không phải trình bày: thẻ đơn site
 * partner (thanh tiến độ "Đã đi 60% · còn 1 giờ", nhãn "Đã trả xe đúng hạn") và sổ khách
 * (`late_return_count` ở `CustomersService`) phải nói cùng một câu về cùng một chuyến.
 */

const MINUTE_MS = 60_000;

export interface RentalProgress {
  /** Phần đã đi của khoảng thuê, 0–100, làm tròn xuống. Quá giờ trả thì kẹp ở 100. */
  percent: number;
  /** Số phút còn tới giờ trả — 0 khi đã quá giờ. */
  remainingMinutes: number;
  /** Số phút đã quá giờ trả — 0 khi chưa tới giờ. */
  overdueMinutes: number;
}

/**
 * Tiến độ của khoảng `[startAt, endAt]` tại `now`.
 *
 * Mốc đầu là lúc xe THẬT SỰ rời tay (`actualPickupAt`) khi có, giờ hẹn khi chưa — nơi gọi quyết
 * định. Khoảng rỗng hoặc ngược (dữ liệu nhập tay hỏng) không chia cho 0: coi như đã đi hết.
 */
export function rentalProgress(
  startAt: string | Date,
  endAt: string | Date,
  now: string | Date = new Date(),
): RentalProgress {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const at = new Date(now).getTime();
  const span = end - start;
  const elapsed = at - start;

  const percent =
    span <= 0 ? 100 : Math.min(100, Math.max(0, Math.floor((elapsed / span) * 100)));
  const remainingMinutes = Math.max(0, Math.floor((end - at) / MINUTE_MS));
  const overdueMinutes = Math.max(0, Math.floor((at - end) / MINUTE_MS));
  return { percent, remainingMinutes, overdueMinutes };
}

/**
 * Xe về SAU giờ hẹn trả — cùng vị từ với `late_return_count` của sổ khách
 * (`actual_return_at > return_at`). Chưa có mốc trả thật thì chưa nói được gì: `false`.
 */
export function isLateReturn(
  returnAt: string | Date,
  actualReturnAt: string | Date | null | undefined,
): boolean {
  if (!actualReturnAt) return false;
  return new Date(actualReturnAt).getTime() > new Date(returnAt).getTime();
}
