import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { bookingRequestRemainingMs, isBookingRequestPastDue } from '@xeprime/types';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Nhịp đếm — một giây. Đủ mượt cho một hạn 60 phút, và rẻ hơn hẳn nhịp theo khung hình. */
const TICK_MS = 1000;

/** Dưới mốc này thì đổi sang màu cảnh báo: còn đủ để mở máy và bấm, không đủ để quên. */
const URGENT_MS = 15 * 60_000;

/**
 * Đếm ngược tới `respondBy` — mốc do SERVER tính, ở đây chỉ đếm.
 *
 * Quá hạn thì so MỐC chứ không so cột `status`: `expired` do worker ghi nên luôn có một cửa sổ
 * (tới một nhịp worker) mà yêu cầu đã chết nhưng vẫn còn `pending_host_approval` trong DB.
 */
export function RespondDeadline({ respondBy }: { respondBy: string }) {
  const t = useTranslations('BookingRequests.deadline');
  // State là MỐC HIỆN TẠI, không phải số mili-giây còn lại: giữ "còn lại" buộc phải `setState`
  // trong effect mỗi khi `respondBy` đổi (thẻ tái sử dụng khi cuộn) — một vòng render thừa.
  const [now, setNow] = useState(() => Date.now());
  const remaining = bookingRequestRemainingMs(respondBy, new Date(now));
  const expired = remaining <= 0 || isBookingRequestPastDue(respondBy, new Date(now));

  useEffect(() => {
    if (expired) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [expired]);

  if (expired) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="time-outline" size={iconSize.xs} color={colors.textMuted} />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('expired')}
        </Text>
      </XStack>
    );
  }

  const urgent = remaining <= URGENT_MS;
  const totalSeconds = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons
        name="hourglass-outline"
        size={iconSize.xs}
        color={urgent ? colors.danger : colors.warning}
      />
      <Text
        col={urgent ? colors.danger : colors.text}
        fos={fontSize.label}
        fow={fontWeight.semibold}
      >
        {t('remaining')} {mm}:{ss}
      </Text>
    </XStack>
  );
}
