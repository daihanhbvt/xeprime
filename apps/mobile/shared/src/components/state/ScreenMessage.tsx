import { XP_TOKENS, toPx } from '@xeprime/ui';
import { Floating } from '@/components/motion/Floating';
import { Image, type ImageSourcePropType } from 'react-native';
import { Text, YStack } from 'tamagui';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space } from '@/theme/tokens';
import { STATE_ART, type StateKind } from './state-art';

/**
 * Cỡ hình minh hoạ - 200 (bản khổ điện thoại của hình 320 trong Figma "States Page" `22306:65271`,
 * cùng thang web khổ ≤600px của `EmptyState`).
 */
const ART = 200;
const ART_STYLE = { width: ART, height: ART };

/** Tiêu đề 20/30 semibold · mô tả 14/20 - cùng thang với web khổ điện thoại. */
const TITLE_SIZE = toPx(XP_TOKENS['font-size-lead']);
const TITLE_LINE = toPx(XP_TOKENS['line-height-lead']);
const DESC_SIZE = toPx(XP_TOKENS['font-size-body']);
const DESC_LINE = toPx(XP_TOKENS['line-height-body']);

/**
 * Bề ngang tối đa của khối chữ - chữ căn giữa chỉ đọc được khi dòng đủ ngắn.
 */
const TEXT_MAX_WIDTH = 320;

interface ScreenMessageProps {
  title: string;
  description?: string;
  /**
   * Nguyên nhân - chọn hình của bản vẽ chung: `empty`/`no-results` "Không tìm thấy kết quả",
   * `error` lỗi hệ thống, `not-found` 404, `maintenance`, `coming-soon`. Mặc định `empty`.
   */
  kind?: StateKind;
  /**
   * @deprecated Giữ cho nơi gọi cũ biên dịch được - trạng thái giờ LUÔN dùng hình chung theo `kind`
   * (người dùng chốt 17/11/2026: một thiết kế cho mọi màn).
   */
  icon?: IconName;
  /** Tranh riêng của một màn (vd bằng lái) - thắng hình chung khi có. */
  art?: ImageSourcePropType;
  actionLabel?: string;
  /** Biểu tượng cho nút hành động - đặt khi hành động là một ĐỘNG TÁC rõ ràng. */
  actionIcon?: IconName;
  onAction?: () => void;
}

/**
 * Trạng thái của cả một màn DÙNG CHUNG toàn app (khách + Partner) - Figma "States Page": hình minh
 * hoạ, một câu nói rõ chuyện gì, và một lối đi tiếp bằng nút vàng chính. Sửa ở đây là đổi cho mọi
 * màn rỗng / lỗi / 404; cùng bộ hình và câu với `EmptyState` + `StatePage` của web.
 */
export function ScreenMessage({
  title,
  description,
  kind = 'empty',
  art,
  actionLabel,
  actionIcon,
  onAction,
}: ScreenMessageProps) {
  const colors = useColors();
  return (
    <YStack f={1} ai="center" jc="center" gap={space.md} p={space.lg}>
      <Floating>
        <Image
          source={art ?? STATE_ART[kind]}
          style={ART_STYLE}
          resizeMode="contain"
          accessible={false}
        />
      </Floating>

      <YStack ai="center" gap={6} maxWidth={TEXT_MAX_WIDTH}>
        <Text
          col={colors.text}
          fos={TITLE_SIZE}
          lh={TITLE_LINE}
          fow={fontWeight.semibold}
          ta="center"
        >
          {title}
        </Text>
        {description ? (
          <Text col={colors.textMuted} fos={DESC_SIZE} lh={DESC_LINE} ta="center">
            {description}
          </Text>
        ) : null}
      </YStack>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="primary"
          size="sm"
          block={false}
          align="center"
          {...(actionIcon ? { icon: actionIcon } : {})}
          onPress={onAction}
        />
      ) : null}
    </YStack>
  );
}
