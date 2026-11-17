import ExclamationCircleOutlined from '@ant-design/icons-svg/es/asn/ExclamationCircleOutlined';
import InboxOutlined from '@ant-design/icons-svg/es/asn/InboxOutlined';
import SearchOutlined from '@ant-design/icons-svg/es/asn/SearchOutlined';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AntIcon } from '@/components/icons/AntIcon';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';

export type EmptyStateVariant = 'empty' | 'no-results' | 'error';

const ICON = {
  empty: InboxOutlined,
  'no-results': SearchOutlined,
  error: ExclamationCircleOutlined,
} as const;

/**
 * Khối trạng thái rỗng / không có kết quả / lỗi - bản native của web `EmptyState`
 * (`components/feedback/EmptyState.module.css`, khổ ≤640): cao tối thiểu 220, đệm 24/12, icon 40
 * (lỗi màu đỏ, còn lại chữ phụ), tiêu đề 16 đậm vừa cách icon 12, mô tả 14 chữ phụ cách 4, nút
 * "Thử lại" dạng CHÍNH cách 12. Dùng chung cho mọi khối của site partner thay vì một dòng chữ nhỏ.
 */
export function EmptyState({
  variant,
  title,
  description,
  onRetry,
  retryLabel,
  action,
}: {
  variant: EmptyStateVariant;
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  const tCommon = useTranslations('Common');
  const isError = variant === 'error';

  return (
    <YStack
      minHeight={MIN_HEIGHT}
      ai="center"
      jc="center"
      px={PAD_X}
      py={PAD_Y}
      accessibilityRole={isError ? 'alert' : 'text'}
    >
      <AntIcon icon={ICON[variant]} color={isError ? colors.danger : colors.textMuted} size={ICON_SIZE} />
      <Text mt={TITLE_GAP} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} ta="center">
        {title}
      </Text>
      {description ? (
        <Text mt={DESC_GAP} maxWidth={DESC_MAX_WIDTH} col={colors.textMuted} fos={fontSize.body} ta="center">
          {description}
        </Text>
      ) : null}
      {onRetry || action ? (
        <XStack mt={TITLE_GAP} gap={ACTIONS_GAP} flexWrap="wrap" jc="center">
          {onRetry ? <Button label={retryLabel ?? tCommon('actions.retry')} onPress={onRetry} /> : null}
          {action}
        </XStack>
      ) : null}
    </YStack>
  );
}

/** Web khổ ≤640: `min-height: 220px`, `padding: var(--xp-space-xl) var(--xp-space-md)` = 24/12. */
const MIN_HEIGHT = 220;
const PAD_Y = 24;
const PAD_X = 12;
const ICON_SIZE = 40;
/** `margin-top: var(--xp-space-md)` = 12 (tiêu đề, hàng nút); mô tả `--xp-space-xs` = 4. */
const TITLE_GAP = 12;
const DESC_GAP = 4;
const ACTIONS_GAP = 8;
/** Web `.description { max-width: 42ch }` ≈ 42 ký tự chữ 14. */
const DESC_MAX_WIDTH = 300;
