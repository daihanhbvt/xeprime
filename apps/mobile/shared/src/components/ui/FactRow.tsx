import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { space, typeScale } from '@/theme/tokens';

/**
 * Một dòng "nhãn ... giá trị" của THẺ DANH SÁCH (khuôn thẻ Lịch sử đơn thuê, người dùng 16/11/2026):
 * nhãn xám trái, giá trị phải căn phải, dòng phụ nhỏ dưới giá trị. Dùng chung cho mọi thẻ danh sách
 * Partner (đơn đã kết thúc, khách hàng, ...) để cùng cỡ chữ và nhịp.
 */
export function FactRow({
  label,
  sub,
  tone,
  children,
}: {
  label: string;
  sub?: string | null;
  /** Màu giá trị (VD công nợ đỏ) - bỏ trống là màu chữ thường. */
  tone?: string;
  children: string;
}) {
  const colors = useColors();
  return (
    <XStack gap={space.sm} jc="space-between" ai="flex-start">
      <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {label}
      </Text>
      <YStack flexShrink={1} ai="flex-end">
        <Text col={tone ?? colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} ta="right">
          {children}
        </Text>
        {sub ? (
          <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} ta="right">
            {sub}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}
