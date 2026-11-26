'use client';

import { BOOKING_SOURCE, BOOKING_SOURCE_VALUES, isMarketplaceBooking } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import styles from './BookingSourceChip.module.css';

interface BookingSourceChipProps {
  /** Mã nguồn đơn (`BOOKING_SOURCE`) - mã là dữ liệu, nhãn đọc từ namespace `Domain`. */
  source: string;
  /** Nhãn chủ xe tự nhập (tên nền tảng, tên nguồn) - hiện thay cho nhãn chung khi có. */
  sourceLabel?: string | null;
  /** `sm`: thanh đơn trên lịch và bảng dày. */
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * Viên NGUỒN ĐƠN (ADR 0110): đơn qua sàn là mặc định nên KHÔNG có viên; các nguồn chủ xe tự khai
 * thác mỗi nguồn một màu, kèm tên kênh khi chủ xe tự nhập. Một component cho
 * thẻ đơn, chi tiết đơn, lịch, "Đơn đã kết thúc" và màn của admin - để cùng một nguồn không hiện
 * hai kiểu ở hai màn.
 */
export function BookingSourceChip({
  source,
  sourceLabel,
  size = 'md',
  className,
}: BookingSourceChipProps) {
  const text = useBookingSourceText();
  // Đơn qua sàn là MẶC ĐỊNH - không gắn nhãn ở bất kỳ đâu; chỉ đơn tự khai thác mới mang viên nguồn.
  if (isMarketplaceBooking(source)) return null;
  const label = text(source, sourceLabel);
  return (
    <span
      className={cx(
        styles.chip,
        size === 'sm' && styles.sm,
        bookingSourceToneClass(source),
        className,
      )}
      title={label}
    >
      <span className={styles.text}>{label}</span>
    </span>
  );
}

/**
 * Lớp màu của một nguồn - dùng chung cho viên nguồn và dấu chữ cái trên thanh đơn của lịch, để một
 * nguồn mang một màu ở mọi nơi. Mã lạ (dữ liệu mới hơn bản web) rơi về sắc "nguồn khác".
 */
export function bookingSourceToneClass(source: string): string | undefined {
  const tone = (BOOKING_SOURCE_VALUES as readonly string[]).includes(source)
    ? source
    : BOOKING_SOURCE.OTHER;
  return styles[tone];
}

/** Chữ của một nguồn đơn: nhãn tự nhập nếu có, không thì nhãn của mã nguồn. */
export function useBookingSourceText(): (source: string, sourceLabel?: string | null) => string {
  const domainLabel = useDomainLabel();
  return (source, sourceLabel) => sourceLabel?.trim() || domainLabel('bookingSource', source);
}
