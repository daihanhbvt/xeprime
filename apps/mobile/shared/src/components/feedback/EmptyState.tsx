import type { ReactNode } from 'react';
import { Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { STATE_ART, type StateKind } from '@/components/state/state-art';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';

export type EmptyStateVariant = StateKind;

/**
 * Khối trạng thái rỗng / không có kết quả / lỗi NẰM TRONG một màn - bản native của web `EmptyState`
 * (khổ ≤600): hình chung của Figma "States Page" 200 · tiêu đề 16 semibold · mô tả 14 · nút chính.
 * Cùng bộ hình (`STATE_ART`) với `ScreenMessage` - một thiết kế cho mọi trạng thái của app.
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
  const isAlert = variant === 'error' || variant === 'maintenance';

  return (
    <YStack
      minHeight={MIN_HEIGHT}
      ai="center"
      jc="center"
      px={PAD_X}
      py={PAD_Y}
      accessibilityRole={isAlert ? 'alert' : 'text'}
    >
      <Image
        source={STATE_ART[variant]}
        style={ART_STYLE}
        resizeMode="contain"
        accessible={false}
      />
      <Text
        mt={TITLE_GAP}
        col={colors.text}
        fos={fontSize.bodyLg}
        fow={fontWeight.semibold}
        ta="center"
      >
        {title}
      </Text>
      {description ? (
        <Text
          mt={DESC_GAP}
          maxWidth={DESC_MAX_WIDTH}
          col={colors.textMuted}
          fos={fontSize.body}
          ta="center"
        >
          {description}
        </Text>
      ) : null}
      {onRetry || action ? (
        <XStack mt={TITLE_GAP} gap={ACTIONS_GAP} flexWrap="wrap" jc="center">
          {onRetry ? (
            <Button label={retryLabel ?? tCommon('actions.retry')} onPress={onRetry} />
          ) : null}
          {action}
        </XStack>
      ) : null}
    </YStack>
  );
}

const MIN_HEIGHT = 220;
const PAD_Y = 24;
const PAD_X = 12;
/** Hình khối trong màn nhỏ hơn hình cả màn (`ScreenMessage` 200) - nó đứng giữa nội dung khác. */
const ART = 160;
const ART_STYLE = { width: ART, height: ART };
const TITLE_GAP = 12;
const DESC_GAP = 6;
const ACTIONS_GAP = 8;
const DESC_MAX_WIDTH = 300;
