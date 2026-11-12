import { Text, XStack } from 'tamagui';
import { XP_TOKENS } from '@xeprime/ui';

import { useTranslations } from 'use-intl';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Nhãn "Xe mới" — Figma `_Badge` (19625:43854): nền success-low, chữ success-high 12/18 medium,
 * đệm 2/8, bo 16. Bản vẽ giữ NGUYÊN màu ở giao diện tối, nên đọc token sáng `color-badge-new-*`
 * (không có bản tối) thay vì `colors.successSurface` đã đổi theo theme.
 */
export function NewVehicleBadge() {
  const t = useTranslations('Listings.card');
  return (
    <XStack flexShrink={0} bg={XP_TOKENS['color-badge-new-bg']} br={16} px={space.sm} py={2}>
      <Text
        col={XP_TOKENS['color-badge-new-text']}
        fos={fontSize.label}
        lh={18}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {t('newVehicle')}
      </Text>
    </XStack>
  );
}
