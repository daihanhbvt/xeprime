import { Ionicons } from '@expo/vector-icons';
import { Text, YStack } from 'tamagui';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Đường kính đĩa nền và cỡ biểu tượng bên trong — cố ý NHỎ: đĩa xám to là thứ nặng nhất trên một
 * màn không có gì, nó hút mắt về phía một biểu tượng không mang thông tin thay vì về câu chữ và
 * lối đi tiếp ngay dưới.
 */
const DISC = 56;
const GLYPH = 24;

/**
 * Bề ngang tối đa của khối chữ.
 *
 * Không có nó thì câu mô tả chạy sát hai mép màn hình và gãy thành ba dòng lệch nhau. Chữ căn
 * giữa chỉ đọc được khi dòng đủ ngắn để mắt không phải tìm lại điểm bắt đầu.
 */
const TEXT_MAX_WIDTH = 300;

interface ScreenMessageProps {
  title: string;
  description?: string;
  icon?: IconName;
  actionLabel?: string;
  /** Biểu tượng cho nút hành động — mặc định không có, đặt khi hành động là một ĐỘNG TÁC rõ ràng. */
  actionIcon?: IconName;
  onAction?: () => void;
}

/** Trạng thái rỗng của cả một màn: biểu tượng, một câu nói rõ chuyện gì, và một lối đi tiếp. */
export function ScreenMessage({
  title,
  description,
  icon = 'file-tray-outline',
  actionLabel,
  actionIcon,
  onAction,
}: ScreenMessageProps) {
  return (
    <YStack f={1} ai="center" jc="center" gap={space.lg} p={space.lg}>
      {/*
        Biểu tượng và chữ là MỘT cụm nên dính nhau (`space.sm`) và cách hành động một khoảng rộng
        hơn hẳn (`space.lg`) — cách đều cả ba thì nút trôi lơ lửng như phần tử thứ ba.
      */}
      <YStack ai="center" gap={space.sm}>
        <YStack
          w={DISC}
          h={DISC}
          br={radius.pill}
          bg={colors.surfaceMuted}
          ai="center"
          jc="center"
        >
          <Ionicons name={icon} size={GLYPH} color={colors.textMuted} />
        </YStack>

        <YStack ai="center" gap={space.xs} maxWidth={TEXT_MAX_WIDTH}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} ta="center">
            {title}
          </Text>
          {description ? (
            // `bodySm` chứ không `body`: đây là câu giải thích, cùng cỡ tiêu đề thì không gì dẫn mắt.
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {description}
            </Text>
          ) : null}
        </YStack>
      </YStack>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="secondary"
          size="sm"
          block={false}
          {...(actionIcon ? { icon: actionIcon } : {})}
          onPress={onAction}
        />
      ) : null}
    </YStack>
  );
}
