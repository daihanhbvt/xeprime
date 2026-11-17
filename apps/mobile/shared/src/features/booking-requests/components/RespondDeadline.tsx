import { useState } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_REMINDER_REMAINING_MINUTES,
  bookingRequestRemainingMs,
  isBookingRequestPastDue,
  longClockText,
} from '@xeprime/types';
import { useNow } from '@/hooks/use-now';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { LineIcon } from '@/components/icons/LineIcon';


/**
 * Đếm ngược tới `respondBy` — mốc do SERVER tính, ở đây chỉ đếm.
 *
 * Quá hạn thì so MỐC chứ không so cột `status`: `expired` do worker ghi nên luôn có một cửa sổ
 * (tới một nhịp worker) mà yêu cầu đã chết nhưng vẫn còn `pending_host_approval` trong DB.
 */
export function RespondDeadline({
  respondBy,
  label,
  expiredLabel,
  urgentMinutes = BOOKING_REQUEST_REMINDER_REMAINING_MINUTES.FINAL,
  variant = 'pill',
}: {
  respondBy: string;
  /**
   * `inline` — đồng hồ ở chân thẻ đơn v2 (Figma "Confirmation Status": icon "Time Circle" 16 +
   * giờ 14/20 nghiêng màu đỏ). Nhãn không hiện (nhóm và viên trạng thái đã nói đây là hạn gì) nhưng
   * vẫn là tên cho trình đọc màn hình. `pill` — khuôn cũ (web `RespondDeadline`).
   */
  variant?: 'pill' | 'inline';
  /** Ngưỡng đổi màu khẩn - hạn THANH TOÁN truyền `HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL` (web). */
  urgentMinutes?: number;
  /** Nhãn trước đồng hồ — vắng = "Còn lại". Dùng lại cho hạn THANH TOÁN (web `CountdownClock`). */
  label?: string;
  /** Câu thay đồng hồ khi hết hạn — vắng = câu hạn phản hồi. */
  expiredLabel?: string;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.deadline');
  /*
   * Giờ lấy từ đồng hồ CHUNG (`useNow`), không phải timer riêng của thẻ — xem chú thích ở hook.
   *
   * Hết hạn là một chiều: chốt bằng state để thôi đăng ký đồng hồ, vì `expired` cần `now` để
   * tính còn `useNow` cần biết `expired` để dừng — chốt lại là cách cắt vòng đó.
   */
  const [done, setDone] = useState(false);
  const now = useNow(!done);
  const remaining = bookingRequestRemainingMs(respondBy, new Date(now));
  const expired = remaining <= 0 || isBookingRequestPastDue(respondBy, new Date(now));
  if (expired && !done) setDone(true);

  if (expired) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="time-outline" size={iconSize.xs} color={colors.placeholder} />
        <Text col={colors.placeholder} fos={fontSize.bodySm}>
          {expiredLabel ?? t('expired')}
        </Text>
      </XStack>
    );
  }

  const urgent = remaining <= urgentMinutes * 60_000;

  if (variant === 'inline') {
    const clock = longClockText(remaining);
    return (
      <XStack
        ai="center"
        gap={space.xs}
        accessible
        accessibilityLabel={`${label ?? t('remaining')} ${clock}`}
      >
        <LineIcon name="time-circle" size={iconSize.sm} color={colors.danger} />
        <Text
          col={colors.danger}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={urgent ? fontWeight.semibold : fontWeight.regular}
          fontStyle="italic"
          fontVariant={TABULAR}
        >
          {clock}
        </Text>
      </XStack>
    );
  }

  return (
    // = web `RespondDeadline.module.css`: icon đồng hồ, chữ 13 xám; dưới 15 phút thành viên thuốc cảnh báo.
    <XStack
      ai="center"
      alignSelf="flex-start"
      gap={space.xs}
      {...(urgent
        ? { px: space.sm, py: 2, bw: 1, bc: colors.warning, br: radius.pill, bg: colors.warningSurface }
        : {})}
    >
      <Ionicons name="time-outline" size={iconSize.xs} color={urgent ? colors.warning : colors.textMuted} />
      <Text col={urgent ? colors.warning : colors.textMuted} fos={fontSize.bodySm} fow={urgent ? fontWeight.semibold : fontWeight.regular}>
        {/* Cửa sổ động tới 4 giờ (ADR 0066) ⇒ `h:mm:ss` khi còn từ một giờ, `m:ss` khi dưới. */}
        {label ?? t('remaining')}{' '}
        <Text col={urgent ? colors.warning : colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {longClockText(remaining)}
        </Text>
      </Text>
    </XStack>
  );
}

/** Chữ số đều bề ngang - đồng hồ không nhảy khi đếm. */
const TABULAR = ['tabular-nums'] as ['tabular-nums'];
