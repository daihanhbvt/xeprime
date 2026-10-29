import { Ionicons } from '@expo/vector-icons';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HOLD_COUNTDOWN_URGENT_MINUTES } from '@xeprime/types';
import { Countdown } from '@/components/ui/Countdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Dòng HUỶ MIỄN PHÍ đặt ngay dưới đồng hồ hạn thanh toán — bản native của web `FreeCancelCountdown`
 * (ADR 0072). Huỷ miễn phí đếm từ lúc tiền giữ chỗ về ĐỦ, không từ lúc chủ xe nhận chuyến:
 *
 *  - **Chưa trả đủ** (`freeCancelStarted = false`): KHÔNG có đồng hồ nào chạy — chưa có đơn để huỷ,
 *    và không trả thì hết hạn là tự huỷ. Chỉ nói trước "trả xong thì được huỷ miễn phí trong {N}"
 *    (số phút server xem trước cho lúc trả NGAY, không tính ở client).
 *  - **Đã trả đủ**: đồng hồ đếm ngược tới mốc ĐÃ LƯU.
 *
 * Chuyến không có huỷ miễn phí (`freeCancelAvailable = false`) không vẽ gì — câu lưu ý đã nói rõ.
 */
export function FreeCancelCountdown({ hold }: { hold: Hold }) {
  const t = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const colors = useColors();
  if (!hold.freeCancelAvailable) return null;
  if (!hold.freeCancelStarted || !hold.freeCancelUntil) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="time-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
          {t('freeCancelFromPaymentShort', {
            duration: fmt.minutesDuration(hold.freeCancelMinutes),
          })}
        </Text>
      </XStack>
    );
  }
  return (
    <Countdown
      deadline={hold.freeCancelUntil}
      urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
      labels={{
        remaining: t('freeCancelCountdown'),
        expired: t('freeCancelCountdownExpired'),
      }}
    />
  );
}
