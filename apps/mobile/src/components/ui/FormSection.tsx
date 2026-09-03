import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Card } from './Card';
import type { IconName } from './Chip';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Tiêu đề KHÔNG viết hoa toàn bộ: tiếng Việt viết hoa hết thì dấu thanh chồng nhau ở cỡ chữ nhỏ. */
export function FormSection({
  title,
  icon,
  children,
  /** `false` khi nội dung tự nó đã là thẻ riêng — bọc thêm một thẻ nữa là viền trong viền. */
  boxed = true,
}: {
  title: string;
  icon?: IconName;
  children: ReactNode;
  boxed?: boolean;
}) {
  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.xs}>
        {icon ? <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} /> : null}
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {title}
        </Text>
      </XStack>

      {boxed ? (
        <Card>
          <YStack gap={space.md}>{children}</YStack>
        </Card>
      ) : (
        <YStack gap={space.sm}>{children}</YStack>
      )}
    </YStack>
  );
}
