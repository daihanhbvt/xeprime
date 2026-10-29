import { useState } from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { mixHex } from '@/theme/color-mix';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
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
  const colors = useColors();
  const t = useTranslations('Trips.unpaid');
  const unpaid = useUnpaidHolds();
  // Thu gọn chỉ còn dòng tiêu đề — lựa chọn trong lượt xem, mở lại màn thì hiện đầy đủ.
  const [collapsed, setCollapsed] = useState(false);
  const data = unpaid.data;
  if (!data || data.items.length === 0) return null;

  const atLimit = data.limitReached;
  const tone = atLimit ? colors.warning : colors.primary;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      br={radius.card}
      bw={1}
      bc={mixHex(tone, colors.surface, 0.5)}
      bg={atLimit ? colors.warningSurface : colors.surface}
    >
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
        hitSlop={space.xs}
      >
      <XStack gap={space.sm} ai="center">
        {/* Icon trong vòng tròn CÓ VIỀN cùng tông — luật icon của app (28/10/2026). */}
        <YStack w={40} h={40} br={radius.pill} ai="center" jc="center" bw={1} bc={tone} bg={colors.surface}>
          <Ionicons name={atLimit ? 'alert-circle-outline' : 'time-outline'} size={iconSize.md} color={tone} />
        </YStack>
        <YStack f={1} gap={space.xs}>
          <Text
            col={colors.text}
            fos={fontSize.body}
            fow={fontWeight.bold}
            accessibilityRole="header"
          >
            {atLimit
              ? t('limitTitle', { limit: data.limit })
              : t('reminderTitle', { count: data.items.length })}
          </Text>
          {/* Viên đếm "n/giới hạn" — nhìn là biết còn giữ thêm được bao nhiêu chuyến. */}
          <XStack alignSelf="flex-start" ai="center" gap={4} px={space.sm} py={2} br={radius.pill} bw={1} bc={tone} bg={colors.surface}>
            <Ionicons name="car-outline" size={12} color={tone} />
            <Text col={tone} fos={fontSize.label} fow={fontWeight.semibold}>
              {`${data.items.length}/${data.limit}`}
            </Text>
          </XStack>
          {collapsed ? null : (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {atLimit ? t('limitBody', { limit: data.limit }) : t('reminderBody')}
          </Text>
          )}
        </YStack>
        <YStack w={28} h={28} br={radius.pill} ai="center" jc="center" bw={1} bc={colors.border} bg={colors.surface}>
          <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={iconSize.sm} color={colors.textMuted} />
        </YStack>
      </XStack>
      </Pressable>
      {collapsed ? null : <UnpaidHoldList items={data.items} />}
    </YStack>
  );
}
