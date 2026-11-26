import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Card } from '@/components/ui/Card';
import { InfoHint } from '@/components/ui/InfoHint';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontSize, radius, space, typeScale } from '@/theme/tokens';

/**
 * Một ô số liệu trong lưới 2×2 đầu sổ Thu-Chi và Công nợ (Figma "Summary Metrics" `24512:125809`):
 * thẻ trắng bo 16, nhãn 12/18 medium viết hoa (`text/gray/medium`), số 18/28 semibold, dòng phụ
 * 12/18 regular (`text/gray/low`). Hai màn dùng CHUNG ô này để đổi một chỗ là đổi cả hai.
 */
export const SummaryTile = memo(function SummaryTile({
  label,
  value,
  valueColor,
  hint,
  info,
  onPress,
}: {
  label: string;
  value: string;
  valueColor: string;
  hint?: string;
  info?: { label: string; content: string };
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    // Hai ô một hàng: `flexBasis` trừ nửa khoảng cách, để hàng thiếu ô vẫn giữ đúng bề rộng.
    <YStack flexBasis="47%" flexGrow={1}>
      <Card
        seamless
        fill
        padded={false}
        radius={radius.card}
        {...(onPress ? { onPress, accessibilityLabel: [label, value].join(' ') } : {})}
      >
        <YStack px={space.lg} py={space.md} gap={space.xs}>
          <XStack ai="center" gap={space.xs}>
            <Text
              col={colors.textMuted}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.medium}
              textTransform="uppercase"
              numberOfLines={1}
              flexShrink={1}
            >
              {label}
            </Text>
            {info ? <InfoHint label={info.label} content={info.content} size={fontSize.label} /> : null}
          </XStack>
          <Text
            col={valueColor}
            fos={typeScale.title.fontSize}
            lh={typeScale.title.lineHeight}
            fontFamily={FONT_FAMILY.semibold}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {value}
          </Text>
          {hint ? (
            <Text
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fontFamily={FONT_FAMILY.body}
              numberOfLines={1}
            >
              {hint}
            </Text>
          ) : null}
        </YStack>
      </Card>
    </YStack>
  );
});
