import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack } from 'tamagui';
import { clockText, countdownSegment, countdownState, holdRemainingMs } from '@xeprime/types';
import { useNow } from '@/hooks/use-now';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * Đồng hồ đếm ngược tới một mốc do SERVER chốt — bản native của `components/data-display/Countdown`.
 *
 * Đồng hồ chạy bằng giờ CỦA MÁY KHÁCH, còn cửa chặn thật luôn nằm ở server (`expires_at` trong
 * chính câu `UPDATE` của lệnh). Lệch giờ vài giây vì thế chỉ làm con số hiển thị lệch vài giây,
 * không bao giờ mở ra một đường đi sau hạn.
 *
 * Khác web ở đúng hai chỗ, và cả hai đều là chuyện của nền tảng:
 *
 *  1. **Nhịp lấy từ `useNow`, không phải `setInterval` riêng.** Một màn hình native sống rất lâu
 *     (Tabs giữ màn cũ trong bộ nhớ), nên một timer của riêng thẻ này sẽ tick cả khi người dùng
 *     đã sang tab khác. `useNow` chỉ chạy khi màn ĐANG focus và gộp mọi đồng hồ vào một timer.
 *  2. **Hết giờ thì chốt lại.** `expired` cần `now`, còn `useNow` cần biết `expired` để dừng —
 *     một `useState` một chiều cắt vòng đó, cùng cách `RespondDeadline` làm.
 *
 * Luật chia chặng và định dạng `m:ss` nằm ở `@xeprime/types`, dùng chung với web: hai client nói
 * hai con số khác nhau về cùng một khoản tiền là lỗi tệ nhất mà màn này có thể có.
 */
export function Countdown({
  deadline,
  urgentMs,
  segmentMs,
  labels,
}: {
  /** Mốc ISO từ API. */
  deadline: string;
  /** Dưới mốc này thì đổi sắc thái cảnh báo. */
  urgentMs: number;
  /** Chia thành chặng bao nhiêu mili-giây; bỏ trống thì đếm một mạch. */
  segmentMs?: number;
  labels: {
    remaining: string;
    expired: string;
    /** Nhãn chặng, ví dụ "lượt 2/2" — chỉ hiện khi có `segmentMs` và còn nhiều hơn một chặng. */
    segment?: (index: number, total: number) => string;
  };
}) {
  const [done, setDone] = useState(false);
  const now = useNow(!done);
  const remaining = holdRemainingMs(deadline, new Date(now));
  const state = countdownState(remaining, urgentMs);
  if (state === 'expired' && !done) setDone(true);

  if (state === 'expired') {
    return (
      <XStack ai="center" gap={space.xs} accessibilityRole="text" accessibilityLiveRegion="polite">
        <Ionicons name="time-outline" size={iconSize.xs} color={colors.textMuted} />
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {labels.expired}
        </Text>
      </XStack>
    );
  }

  const segment = segmentMs ? countdownSegment(remaining, segmentMs) : null;
  const shown = segment ? segment.remainingInSegment : remaining;
  const urgent = state === 'urgent';

  return (
    <XStack
      ai="center"
      gap={space.xs}
      flexWrap="wrap"
      accessibilityRole="text"
      /* Lịch sự: trình đọc màn hình không đọc lại mỗi giây, nhưng vẫn biết khi sắc thái đổi. */
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name="hourglass-outline"
        size={iconSize.xs}
        color={urgent ? colors.danger : colors.warning}
      />
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {labels.remaining}
      </Text>
      <Text
        col={urgent ? colors.danger : colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.bold}
        /* Số nhảy mỗi giây — chữ số cùng bề rộng để dòng không co giật. */
        fontVariant={['tabular-nums']}
      >
        {clockText(shown)}
      </Text>
      {segment && segment.total > 1 && labels.segment ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {labels.segment(segment.index, segment.total)}
        </Text>
      ) : null}
    </XStack>
  );
}
