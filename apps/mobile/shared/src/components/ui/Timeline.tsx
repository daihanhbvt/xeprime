import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

export type TimelineDot = 'pickup' | 'return';

export interface TimelineItem {
  readonly key: string;
  /** `pickup` chấm xanh lá, `return` chấm xanh dương - Figma "_Dot". */
  readonly dot: TimelineDot;
  /** Dòng chính 14/20 semibold - mốc + hình thức ("T6, 20/11  17:00 · Giao xe tận nơi"). */
  readonly title: string;
  /** Các dòng chi tiết 14/20 `text/gray/medium` - địa chỉ. */
  readonly lines?: readonly string[];
  /** Dòng chú thích 12/18 `text/gray/very-low` - thời lượng thuê. */
  readonly meta?: string;
}

/**
 * Dòng thời gian nhận ↔ trả của chuyến (Figma tấm duyệt "Hoạt động đơn thuê" `24145:96711`): chấm
 * 10 trước dòng chính, vạch dọc 1px nối xuống mục sau, chi tiết thụt theo cột chấm.
 *
 * Mục CUỐI không vẽ vạch (không còn gì để nối tới).
 */
export const Timeline = memo(function Timeline({ items }: { items: readonly TimelineItem[] }) {
  const colors = useColors();
  if (items.length === 0) return null;

  return (
    <YStack gap={ITEM_GAP}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const hasDetail = Boolean(item.lines?.length || item.meta);
        return (
          <YStack key={item.key} gap={ROW_GAP}>
            <XStack ai="center" gap={DOT_GAP}>
              <YStack
                w={DOT}
                h={DOT}
                br={radius.pill}
                bg={item.dot === 'pickup' ? colors.success : colors.infoStrong}
              />
              <Text
                f={1}
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.title}
              </Text>
            </XStack>
            {hasDetail ? (
              <XStack gap={ROW_GAP}>
                <YStack w={DOT} ai="center">
                  {last ? null : <YStack w={1} f={1} bg={colors.border} />}
                </YStack>
                <YStack f={1} minWidth={0} gap={ROW_GAP}>
                  {item.lines?.map((line) => (
                    <Text
                      key={line}
                      col={colors.textBody}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                    >
                      {line}
                    </Text>
                  ))}
                  {item.meta ? (
                    <Text
                      col={colors.textPlaceholder}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      numberOfLines={1}
                    >
                      {item.meta}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            ) : null}
          </YStack>
        );
      })}
    </YStack>
  );
});

/** Figma: chấm 10, chấm ↔ chữ 8, các hàng trong mục cách 6, hai mục cách 8. */
const DOT = 10;
const DOT_GAP = 8;
const ROW_GAP = 6;
const ITEM_GAP = 8;
