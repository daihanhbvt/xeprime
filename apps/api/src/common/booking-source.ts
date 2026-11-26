import type { Prisma } from '@xeprime/prisma';
import {
  BOOKING_SOURCE,
  BOOKING_SOURCE_DEFAULT_DIRECT,
  BOOKING_SOURCE_FILTER_DIRECT,
  bookingSourceTakesLabel,
} from '@xeprime/types';

/**
 * Bộ lọc NGUỒN ĐƠN (ADR 0110) — MỘT phép cho danh sách đơn của gian hàng và của admin: một nguồn cụ
 * thể, `direct` = mọi đơn ngoài sàn (mọi nguồn trừ `xeprime`), kèm nhãn tự nhập nếu có.
 */
export function bookingSourceWhere(
  source: string | undefined,
  sourceLabel: string | undefined,
): Prisma.BookingWhereInput {
  return {
    ...(source === BOOKING_SOURCE_FILTER_DIRECT
      ? { source: { not: BOOKING_SOURCE.XEPRIME } }
      : source
        ? { source }
        : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
  };
}

/**
 * Nguồn + nhãn của một đơn TỰ LẬP, đã chuẩn hoá: vắng nguồn ⇒ `other` (app chưa cập nhật); nhãn chỉ
 * giữ ở hai nguồn nhận nhãn — DTO đã chặn `xeprime` và đã đòi nhãn khi cần.
 */
export function directSourceOf(dto: { source?: string; sourceLabel?: string | null }): {
  source: string;
  sourceLabel: string | null;
} {
  const source = dto.source ?? BOOKING_SOURCE_DEFAULT_DIRECT;
  return {
    source,
    sourceLabel: bookingSourceTakesLabel(source) ? dto.sourceLabel?.trim() || null : null,
  };
}
