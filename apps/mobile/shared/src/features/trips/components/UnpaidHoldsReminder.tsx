import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useUnpaidHolds } from '../hooks/use-trips';
import { UnpaidHoldList } from './UnpaidHoldList';

/**
 * THẺ NHẮC THANH TOÁN ở đầu "Chuyến của tôi" — bản native của `UnpaidHoldsReminder` (web). Chỉ
 * hiện khi khách đang giữ chuyến chưa trả.
 *
 * Hai giọng: còn dưới trần ⇒ nhắc nhẹ; đã chạm trần (`HOLD_MAX_OPEN_PER_CUSTOMER`) ⇒ cảnh báo —
 * không đặt thêm xe được tới khi trả hoặc huỷ bớt. Đứng TRÊN tab: chuyến chưa trả là việc phải làm
 * NGAY. Tải hỏng hoặc đang tải thì im lặng — danh sách chuyến ngay dưới vẫn có đủ từng chuyến.
 */
export function UnpaidHoldsReminder() {
  const t = useTranslations('Trips.unpaid');
  const unpaid = useUnpaidHolds();
  const data = unpaid.data;
  if (!data || data.items.length === 0) return null;

  const atLimit = data.limitReached;
  const tone = atLimit ? colors.warning : colors.primary;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      mt={space.sm}
      br={radius.lg}
      bw={1}
      bc={tone}
      bg={atLimit ? colors.warningSurface : colors.surface}
    >
      <XStack gap={space.sm} ai="flex-start">
        <Ionicons
          name={atLimit ? 'alert-circle' : 'time-outline'}
          size={iconSize.md}
          color={tone}
        />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} accessibilityRole="header">
            {atLimit
              ? t('limitTitle', { limit: data.limit })
              : t('reminderTitle', { count: data.items.length })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {atLimit ? t('limitBody', { limit: data.limit }) : t('reminderBody')}
          </Text>
        </YStack>
      </XStack>
      <UnpaidHoldList items={data.items} />
    </YStack>
  );
}
