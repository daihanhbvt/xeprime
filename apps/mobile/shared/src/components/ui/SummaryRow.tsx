import { memo, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, typeScale } from '@/theme/tokens';

export type SummaryRowEmphasis = 'none' | 'brand' | 'success';

/**
 * Một dòng "nhãn - giá trị" của "Nhóm thông tin" v2 (Figma tấm duyệt `24145:96812`, `24145:96837`):
 * nhãn 14/20 `text/gray/low` bên trái (kèm `labelExtra` - viên trạng thái, dấu "i"), dòng phụ 12/18
 * dưới nhãn; giá trị 14/20 đậm vừa bên phải.
 *
 * `emphasis` là dòng TỔNG cuối khối: nhãn đậm vừa `text/gray/medium`, giá trị 16/24 semibold màu
 * thương hiệu (`brand` - "Còn lại phải thu") hoặc xanh (`success` - "Số tiền cộng ví").
 *
 * Giá trị không xuống dòng (`numberOfLines 1`); nhãn dài co lại và cắt "..." thay vì đẩy số tiền.
 */
export const SummaryRow = memo(function SummaryRow({
  label,
  labelExtra,
  sub,
  value,
  emphasis = 'none',
  accessibilityLabel,
}: {
  label: string;
  labelExtra?: ReactNode;
  sub?: string;
  value: ReactNode;
  emphasis?: SummaryRowEmphasis;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const strong = emphasis !== 'none';
  const valueColor =
    emphasis === 'brand' ? colors.brandMoney : emphasis === 'success' ? colors.success : colors.text;
  const valueType = strong ? typeScale.title : typeScale.body;

  return (
    <XStack
      ai={strong ? 'center' : 'flex-start'}
      jc="space-between"
      gap={GAP}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      <YStack f={1} minWidth={0}>
        <XStack ai="center" gap={LABEL_GAP} minWidth={0}>
          <Text
            flexShrink={1}
            col={strong ? colors.textBody : colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={strong ? fontWeight.medium : fontWeight.regular}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {label}
          </Text>
          {labelExtra}
        </XStack>
        {sub ? (
          <Text
            col={colors.textMuted}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {sub}
          </Text>
        ) : null}
      </YStack>
      {typeof value === 'string' ? (
        <Text
          flexShrink={0}
          col={valueColor}
          fos={valueType.fontSize}
          lh={valueType.lineHeight}
          fow={strong ? fontWeight.semibold : fontWeight.medium}
          ta="right"
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </XStack>
  );
});

/** Figma: nhãn ↔ viên/dấu "i" cách 6-8; nhãn ↔ giá trị tối thiểu 8. */
const GAP = 8;
const LABEL_GAP = 6;
