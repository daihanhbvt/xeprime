import { Text, XStack, YStack } from 'tamagui';
import type { StatusColor } from '@xeprime/types';
import { IconDisc } from '@/components/ui/IconDisc';
import type { IconName } from '@/components/ui/Chip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Đầu thẻ của MỘT phương thức thanh toán (VietQR, ví điện tử) — cùng một khung cho mọi thẻ để
 * hai phương thức đọc ra là hai lựa chọn ngang hàng: đĩa biểu tượng · tên · viên nhãn, rồi một
 * dòng phụ giải thích.
 */
export function PaymentMethodHeader({
  icon,
  title,
  badge,
  subtitle,
}: {
  icon: IconName;
  title: string;
  badge?: { label: string; color: StatusColor } | null;
  subtitle?: string;
}) {
  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.sm}>
        <IconDisc icon={icon} tone={colors.primaryActive} surface={colors.primaryLight} />
        <YStack f={1} gap={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {title}
          </Text>
          {badge ? <StatusBadge label={badge.label} color={badge.color} size="sm" /> : null}
        </YStack>
      </XStack>
      {subtitle ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}
